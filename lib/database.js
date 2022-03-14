'use strict'

const { dbWith, ATTEMPT, INSIDE_TX, START_TX } = require('./fn-db')
const { sql } = require('./sql')

class DatabaseCtx {
  constructor (client, f) {
    this.client = client
    this._db = f
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
    return this._db(START_TX, body)
  }

  inTx (body) {
    return this._db(INSIDE_TX, body)
  }

  try (body) {
    return this._db(ATTEMPT, body)
  }
}

const wrapCtx = (f, client) => new DatabaseCtx(client, f)

class Database extends DatabaseCtx {
  constructor (pgPool, opts = {}) {
    super(null, dbWith(pgPool, {...opts, wrapCtx}))
    this.pool = pgPool
  }
}

module.exports = {
  Database,
}
