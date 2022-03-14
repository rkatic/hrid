'use strict'

const { createLocker } = require('./utils/locker')

const ATTEMPT = txLevel => txLevel > 0
const INSIDE_TX = txLevel => txLevel === 0
const START_TX = () => true

const dbWith = ({
  pool,
  runQuery = defaultRunQuery,
  runFn = (fn, db) => fn(db),
}) => {
  const config = { pool, runQuery, runFn }

  return (arg, toUseTx) => toUseTx
    ? runTask(config, arg, toUseTx, 0)
    : runQuery(arg, pool)
}

const defaultRunQuery = async (query, client) => {
  if (typeof query === 'string') {
    throw new TypeError('simple strings not allowed')
  }
  const { rows } = await client.query(query)
  return rows
}

const runTask = async (config, body, toUseTx, txLevel, client = null) => {
  const isTx = toUseTx(txLevel)
  const locker = createLocker()
  let lock = null
  let pendingQueries = 0
  let finished = false

  const db = async (arg, toUseTx) => {
    if (finished) {
      throw new Error('using finished (sub)transaction')
    }

    if (toUseTx || ++pendingQueries === 1) {
      lock = await locker.lock()

      if (finished) {
        pendingQueries = 0
        lock.release()
        throw new Error('transaction aborted')
      }
    }

    let returned = false

    try {
      const result = toUseTx
        ? await runTask(config, arg, toUseTx, txLevel, client)
        : await config.runQuery(arg, client)
      
      returned = true
      return result
    } finally {
      if (toUseTx || --pendingQueries === 0) {
        if (returned) {
          lock.release()
        } else {
          process.nextTick(lock.release)
        }
      }
    }
  }

  let over = false
  
  try {
    let returned = false
    let needsRelease = false

    if (!client) {
      client = await config.pool.connect()
      needsRelease = true
    }

    if (isTx) {
      ++txLevel
      await client.query(txLevel === 1 ? 'BEGIN' : `SAVEPOINT sp${txLevel}`)
    }
  
    try {
      const result = (typeof body === 'function')
        ? await config.runFn(body, db, client)
        : await config.runQuery(body, client)

      returned = true
      return result
    } finally {
      finished = true
  
      if (lock) {
        await lock.released
      }
  
      if (isTx) {
        if (returned) {
          await client.query(txLevel === 1 ? 'COMMIT' : `RELEASE SAVEPOINT sp${txLevel}`)
        } else {
          await client.query(txLevel === 1 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT sp${txLevel}`)
        }
        // --txLevel
      }

      if (needsRelease) {
        client.release()
      }

      over = true
    }
  } finally {
    if (!over) {
      client.release(true)
    }
  }
}

module.exports = {
  dbWith,
  ATTEMPT,
  INSIDE_TX,
  START_TX,
}