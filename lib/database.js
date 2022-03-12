'use strict'

const { createLocker } = require('./utils/locker')
const { sql: SQL } = require('./sql')

class Database {
  constructor (pgPool, opts = {}) {
    this.pgPool = pgPool
    this._opts = opts
  }

  async query (query) {
    if (typeof query === 'string') {
      throw new TypeError('query: simple string not allowed. Use .sql`...` or .query({ text: \'SELECT ...\' })')
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
    return this.query(SQL(...args))
  }

  update (options) {
    return this.query(SQL.update(options))
  }

  insert (options) {
    return this.query(SQL.insert(options))
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
    this._locker = createLocker()
    this._lock = null
    this._waitingLock = 0
    this._pendingQueries = 0

  }
  
  async _acquireLock () {
    ++this._waitingLock
    this._lock = await this._locker.lock()
    --this._waitingLock
  }
  
  _releaseLock = () => {
    process.nextTick(this._lock.resolve)
  }

  async _runQuery (query) {
    if (!this.pgClient) {
      throw new Error('running query in finished task/tx')
    }

    if (++this._pendingQueries === 1) {
      await this._acquireLock()
    }

    try {
      return await this.pgClient.query(query)
    } finally {
      if (--this._pendingQueries === 0) {
        this._releaseLock()
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
      this._releaseLock()
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

      if (this._waitingLock) {
        const rejection = Promise.reject(new Error('task/tx aborted'))
        this._lock.resolve(rejection)
      }

      if (isTx) {
        // To ensure that queries are not leaked out, we wait for them to finish before the commit/rollback.
        if (this._lock) {
          await this._lock.settled
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
