'use strict'

const test = require('tape')
const { connect, delay } = require('./helpers')
const { sql } = require('../lib/sql')

test('parallel sub transactions', async t => {
  const db = connect()

  await db.query(sql`
    DROP TABLE IF EXISTS test_tx;
    CREATE TABLE test_tx (
      id SERIAL PRIMARY KEY,
      "desc" TEXT
    )
  `)

  const insertDescSql = desc => sql`
    INSERT INTO test_tx ("desc")
    VALUES (${desc})
  `

  const runQueries = (prefix, n, ms) => async db => {
    let i = 0
    for (const _ of Array(n)) {
      await db.query(insertDescSql(`${prefix} ${++i}`))
      await delay(ms)
    }
  }

  async function runFailingSubTx (tx) {
    await tx.tx(async tx => {
      await tx.query(insertDescSql('back-rolled'))
      await delay(2.5e3)
      // eslint-disable-next-line promise/catch-or-return
      delay(100)
      .then(() => tx.query(insertDescSql('leaked out'))) // a bug-like case
      .catch(() => {})
      await tx.query(sql`SOMETHING WRONG`)
      // throw 'bla'
    })
  }

  await db.tx(async tx => {
    await Promise.all([
      runQueries('top', 2, 10)(tx),
      tx.tx(runQueries('sub', 2, 5))
    ])
  })

  await db.tx(async tx => {
    await Promise.all([
      runQueries('query', 5, 100)(tx),
      runFailingSubTx(tx).then(t.fail, t.ok),
    ])
  })

  const rows = await db.query(sql`
    SELECT "desc" FROM "test_tx"
    ORDER BY "id"
  `)
  
  const seq = rows.map(r => r.desc)

  t.deepEqual(seq, [
    'top 1',
    'sub 1',
    'sub 2',
    'top 2',
    'query 1',
    'query 2',
    'query 3',
    'query 4',
    'query 5',
  ])

  let allSettled = null
  let continued = false

  await db.tx(async tx => {

    const promises = [
      tx.tx(sql`ERROR`),
      tx.inTx(() => {
        continued = true
      })
    ]

    allSettled = Promise.allSettled(promises)

    await Promise.all(promises)
  }) 
  .then(t.fail, t.ok)
  
  await allSettled
  t.notOk(continued, 'did not continue on failure')

  db.pool.end()
})

test('.try(..)', async t => {
  const db = await connect()

  await db.query(sql`ERR`).then(t.fail, t.ok)
  await db.try(sql`ERR`).then(t.fail, t.ok)

  await db.tx(async tx => {
    await tx.query(sql`ERR`).catch(t.ok)

    const [{ val }] = await tx.query(sql`SELECT 1 as "val"`)
    return val
  })
  .then(t.fail, t.ok)

  {
    const res = await db.tx(async tx => {
      await tx.try(sql`ERR`).catch(t.ok)
  
      const [{ val }] = await tx.query(sql`SELECT 1 as "val"`)
      return val
    })

    t.strictEqual(res, 1)
  }

  db.pool.end()

})