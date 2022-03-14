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

  async function runQueries (tx) {
    for (const x of [1, 2, 3, 4, 5]) {
      await tx.query(insertDescSql(`query ${x}`))
      await delay(100)
    }
  }

  async function runSubTx (tx) {
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
      runQueries(tx),
      runSubTx(tx).then(t.fail, t.ok),
    ])

    // const [ res ] = await tx.query(sql`SELECT 1 as "value"`)
    // t.strictEqual(res.value, 1)
  })

  const rows = await db.query(sql`SELECT "desc" FROM "test_tx"`)

  t.deepEqual(rows, [
    { desc: 'query 1' },
    { desc: 'query 2' },
    { desc: 'query 3' },
    { desc: 'query 4' },
    { desc: 'query 5' },
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