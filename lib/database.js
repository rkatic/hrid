'use strict'

const { dbWith, INSIDE_TX, START_TX } = require('./fn-db')
const { sql } = require('./sql')
const { isArray } = Array

class DatabaseCtx {
  constructor (db) {
    this._db = db
  }

  async query (query) {
    const res = await this._db(query)

    return isArray(res)
      ? res[res.length - 1].rows
      : res.rows
  }

  async results (query) {
    const res = await this._db(query)

    return isArray(res) ? res : [res]
  }

  update (options) {
    return this._db(sql.update(options))
  }

  insert (options) {
    return this._db(sql.insert(options))
  }

  tx (fn) {
    return this._db(fn, START_TX)
  }

  inTx (fn) {
    return this._db(fn, INSIDE_TX)
  }
}

class Database extends DatabaseCtx {
  constructor (pool) {
    super(dbWith({
      pool,
      runQuery: (query, client) => {
        if (typeof query === 'string') {
          throw new TypeError('simple strings not allowed')
        }
        return client.query(query)
      },
      runFn: (fn, db) => fn(new DatabaseCtx(db)),
    }))
    this.pool = pool
  }
}

module.exports = {
  Database,
}
