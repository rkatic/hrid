'use strict'

const { Mutex } = require('./utils/mutex')

const ATTEMPT = txLevel => txLevel > 0
const INSIDE_TX = txLevel => txLevel === 0
const START_TX = () => true

const dbWith = ({
  pool,
  runQuery = defaultRunQuery,
  runFn = (fn, db) => fn(db),
}) => {
  const config = { pool, runQuery, runFn }

  return (arg, txMode) => txMode
    ? runTask(config, arg, txMode(0), 0)
    : runQuery(arg, pool) 
}

const defaultRunQuery = async (query, client) => {
  if (typeof query === 'string') {
    throw new TypeError('simple strings not allowed')
  }
  const { rows } = await client.query(query)
  return rows
}

const runTask = async (config, body, useTx, txLevel, givenClient = null) => {
  const client = givenClient || await config.pool.connect()
  const mutex = new Mutex()
  let queryLockPromise = null
  let pendingQueries = 0
  let finished = false

  const db = async (arg, txMode) => {
    if (finished) {
      throw new Error('using finished (sub)transaction')
    }

    if (!txMode && ++pendingQueries === 1) {
      queryLockPromise = mutex.lock()
    }

    const unlock = await (txMode ? mutex.lock() : queryLockPromise)

    if (finished) {
      unlock()
      throw new Error('transaction aborted')
    }

    let ok = false

    try {
      const result = txMode
        ? await runTask(config, arg, txMode(txLevel), txLevel, client)
        : await config.runQuery(arg, client)
      
      ok = true
      return result
    } finally {
      if (txMode || --pendingQueries === 0) {
        if (ok) {
          unlock()
        } else {
          process.nextTick(unlock)
        }
      }
    }
  }

  let over = false
  
  try {
    let ok = false

    if (useTx) {
      ++txLevel
      await client.query(txLevel === 1 ? 'BEGIN' : `SAVEPOINT sp${txLevel}`)
    }
  
    try {
      const result = (typeof body === 'function')
        ? await config.runFn(body, db, client)
        : await config.runQuery(body, client)

      ok = true
      return result
    } finally {
      finished = true
  
      await mutex.unlocked
  
      if (useTx) {
        if (ok) {
          await client.query(txLevel === 1 ? 'COMMIT' : `RELEASE SAVEPOINT sp${txLevel}`)
        } else {
          await client.query(txLevel === 1 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT sp${txLevel}`)
        }
        // --txLevel
      }

      if (!givenClient) {
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