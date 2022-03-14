'use strict'

const { dbWith, ATTEMPT, INSIDE_TX, START_TX } = require('./fn-db')
const { sql } = require('./sql')

class DatabaseCtx {
  constructor (db) {
    this._db = db
  }

  query (query) {
    return this._db(query)
  }

  update (options) {
    return this._db(sql.update(options))
  }

  insert (options) {
    return this._db(sql.insert(options))
  }

  tx (body) {
    return this._db(body, START_TX)
  }

  inTx (body) {
    return this._db(body, INSIDE_TX)
  }

  try (body) {
    return this._db(body, ATTEMPT)
  }
}

class Database extends DatabaseCtx {
  constructor (pool, { runQuery } = {}) {
    super(dbWith({
      pool,
      runQuery,
      runFn: (fn, db) => fn(new DatabaseCtx(db)),
    }))
    this.pool = pool
  }
}

module.exports = {
  Database,
}
