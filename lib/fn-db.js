'use strict'

const { createLocker } = require('./utils/locker')

const ATTEMPT = txLevel => txLevel > 0
const INSIDE_TX = txLevel => txLevel === 0
const START_TX = () => true

const dbWith = (pool, opts = {}) => async (arg, body) => {
  if (body) {
    const client = await pool.connect()
    try {
      return await runBody(client, body, 0, arg(0), opts)
    } finally {
      client.release()
    }
  }

  return runQuery(pool, arg, opts)
}

const runQuery = async (client, query, opts) => {
  if (typeof query === 'string') {
    throw new TypeError('simple string not allowed')
  }
  try {
    const { rows } = await client.query(query)
    return rows
  } catch (e) {
    if (opts.queryErrorHandler) {
      opts.queryErrorHandler(e, query)
    }
    throw e
  }
}

const runBody = async (client, body, txLevel, isTx, opts) => {
  const locker = createLocker()
  let lock = null
  let pendingQueries = 0
  let finished = false

  const db = async (arg, body) => {
    if (finished) {
      throw new Error('using finished (sub)transaction')
    }

    if (body || ++pendingQueries === 1) {
      lock = await locker.lock()

      if (finished) {
        lock.release()
        throw new Error('transaction aborted')
      }
    }

    let throwed = false

    try {
      return body
        ? await runBody(client, body, txLevel, arg(txLevel), opts)
        : await runQuery(client, arg, opts)
    } catch (e) {
      throwed = true
      throw e
    } finally {
      if (body || --pendingQueries === 0) {
        if (throwed) {
          process.nextTick(lock.release)
        } else {
          lock.release()
        }
      }
    }
  }

  const fatal = e => {
    if (client) {
      client.release(true)
      client = null
    }
    throw e
  }

  let throwed = false

  if (isTx) {
    ++txLevel
    await client.query(txLevel === 1 ? 'BEGIN' : `SAVEPOINT sp${txLevel}`).catch(fatal)
  }

  try {
    if (typeof body === 'function') {
      const ctx = opts.wrapCtx ? opts.wrapCtx(db, client) : db
      return await body(ctx)
    }
    return await runQuery(client, body, opts)
  } catch (e) {
    throwed = true
    throw e
  } finally {
    finished = true

    if (lock) {
      await lock.released
    }

    if (isTx) {
      if (throwed) {
        await client.query(txLevel === 1 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT sp${txLevel}`).catch(fatal)
      } else {
        await client.query(txLevel === 1 ? 'COMMIT' : `RELEASE SAVEPOINT sp${txLevel}`).catch(fatal)
      }
      --txLevel
    }
  }
}

module.exports = {
  dbWith,
  ATTEMPT,
  INSIDE_TX,
  START_TX,
}