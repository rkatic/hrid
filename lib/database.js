'use strict'

const { createLocker } = require('./utils/locker')
const { sql: _sql, Sql } = require('./sql')

class Database {
  constructor (pgPool, opts = {}) {
    this.pgPool = pgPool
    this._opts = opts
  }

  async query (query) {
    if (typeof query === 'string') {
      throw new TypeError('query: simple string not allowed. Use .sql`...` or .query({ text: \'SELECT ...\' })')
    }
    if (query instanceof Sql) {
      query = this._opts.parseOnServer
        ? query.toPgQuery()
        : query.toPlainQuery()
    }
    try {
      const { rows } = await this._runQuery(query)
      return rows
    } catch (e) {
      if (this._opts.queryErrorHandler) {
        this._opts.queryErrorHandler(e, query)
      }
      throw e
    }
  }

  sql (...args) {
    return this.query(_sql(...args))
  }

  update (options) {
    return this.query(_sql.update(options))
  }

  insert (options) {
    return this.query(_sql.insert(options))
  }

  task (fn) {
    return this._runTask(fn, false)
  }

  tx (fn) {
    return this._runTask(fn, true)
  }

  _runQuery (query) {
    return this.pgPool.query(query)
  }

  async _runTask (fn, isTx) {
    const task = new Task(this._opts, 0)
    const pgClient = await this.pgPool.connect()
    try {
      return await task._run(pgClient, fn, isTx)
    } finally {
      // Don't reuse the pgClient if task failed to finish transaction!
      pgClient.release(task._txLevel > 0)
    }
  }
}

class Task extends Database {
  constructor (opts, txLevel) {
    super(null, opts)
    this.pgClient = null
    this._txLevel = txLevel
    this.__locker = createLocker()
    this.__unlock = null
    this.__locked = false
    this._pendingQueries = 0

    this._releaseLock = () => {
      if (this.__unlock) {
        this.__unlock()
        this.__unlock = null
      }
    }
  }

  async _acquireLock () {
    this.__unlock = await this.__locker.lock()
  }

  async _runQuery (query) {
    if (!this.pgClient) {
      throw new Error('running query in finished task/tx')
    }

    if (this._pendingQueries === 0) {
      await this._acquireLock()
    }

    ++this._pending
    try {
      return await this.pgClient.query(query)
    } finally {
      if (--this._pendingQueries === 0) {
        process.nextTick(this._releaseLock)
      }
    }
  }

  async _runTask (fn, isTx) {
    if (!this.pgClient) {
      throw new Error('running sub task/tx in finished task/tx')
    }

    await this._acquireLock()

    try {
      const task = new Task(this._opts, this._txLevel)
      return await task._run(this.pgClient, fn, isTx)
    } finally {
      process.nextTick(this._releaseLock)
    }
  }

  _getTxQuery (topTxQuery, subTxQuery) {
    return this._txLevel === 1 ? topTxQuery : `${subTxQuery} sp${this._txLevel}`
  }

  async _run (pgClient, fn, isTx = false) {
    let throwed = false

    if (isTx) {
      ++this._txLevel
      await pgClient.query(this._getTxQuery('BEGIN', 'SAVEPOINT'))
    }

    this.pgClient = pgClient

    try {
      return await fn(this)
    } catch (e) {
      throwed = true
      throw e
    } finally {
      this.pgClient = null

      if (this.__unlock) {
        const rejection = Promise.reject(new Error('task/tx aborted'))
        this.__unlock(rejection)
      }

      if (isTx) {
        // To ensure that queries are not leaked out, we wait for them to finish before the commit/rollback.
        if (this.__unlock) {
          try {
            await this.__locker.lock()
          } catch (e) {}
        }

        await pgClient.query(throwed
          ? this._getTxQuery('ROLLBACK', 'ROLLBACK TO SAVEPOINT')
          : this._getTxQuery('COMMIT', 'RELEASE SAVEPOINT'),
        )
        --this._txLevel
      }
    }
  }
}

module.exports = {
  Database,
  Task,
}
