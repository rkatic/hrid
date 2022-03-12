'use strict'

const test = require('tape')

const { sql } = require('../lib')

const unindent = str => str.trim().replace(/\n\s*/g, ' ')
const unindentRaw = (...args) => unindent(String.raw(...args))

test('simple template', async t => {
  const table = 'tab"le'
  const data = [1, 'hel\'lo', { x: [1] }, ['world']]

  const res = sql`SELECT * FROM "${table}" WHERE data = ${data} AND age > ${18}`

  t.is(res.text, `SELECT * FROM "tab""le" WHERE data = array[1,'hel''lo','{"x":[1]}',array['world']] AND age > 18`)
})

test('template composition', async t => {
  const sql1 = sql`SELECT * FROM "table1" WHERE id = ANY(${[1, 2, 3]})`
  const sql2 = sql`SELECT * FROM "table2" WHERE ref IN (${sql1}) AND type = ${4}`

  const plain = sql2.text

  t.is(plain, `SELECT * FROM "table2" WHERE ref IN (SELECT * FROM "table1" WHERE id = ANY(array[1,2,3])) AND type = 4`)
})

test('sql.update', async t => {
  const sql1 = sql.update({
    table: 'user',
    where: { id: 1 },
    set: { name: 'Alex', human: true },
    skipEqual: true,
    returning: '*',
  })

  const plain = sql1.text

  t.is(unindent(plain), unindentRaw`
    UPDATE "user"
    SET ("name","human") = ('Alex',true)
    WHERE ("id" = 1)
      AND ("name","human") IS DISTINCT FROM ('Alex',true)
    RETURNING *
  `)
})

test('upsert with sql.insert', async t => {
  const upsertSql = sql.insert({
    into: 'user',
    data: { id: 1, name: 'Ivan' },
    onConflict: 'id',
    update: true,
    skipEqual: true,
    returning: ['id'],
  })

  const plain = upsertSql.text

  t.is(unindent(plain), unindentRaw`
    INSERT INTO "user" t ("id","name") VALUES
    (1,'Ivan')
    ON CONFLICT ("id") DO UPDATE
    SET ("name") = (Excluded."name")
    WHERE (t."name") IS DISTINCT FROM (Excluded."name")
    RETURNING "id"
  `)
})

test('upsert of multiple rows with sql.insert', async t => {
  const upsertSql = sql.insert({
    into: 'user',
    columns: ['id', 'name'],
    data: [
      { id: 1, name: 'Ivan' },
      { id: 2, name: 'Ante' },
    ],
    onConflict: 'id',
    update: true,
    skipEqual: true,
    returning: ['id'],
  })

  const plain = upsertSql.text

  t.is(unindent(plain), unindentRaw`
    INSERT INTO "user" t ("id","name") VALUES
    (1,'Ivan'),
    (2,'Ante')
    ON CONFLICT ("id") DO UPDATE
    SET ("name") = (Excluded."name")
    WHERE (t."name") IS DISTINCT FROM (Excluded."name")
    RETURNING "id"
  `)
})

test('upsert with sql.insert on minimal columns', async t => {
  const upsertSql = sql.insert({
    into: 'user',
    data: { id: 7 },
    onConflict: 'id',
    update: true,
    skipEqual: true,
    returning: ['id'],
  })

  const plain = upsertSql.text

  t.is(unindent(plain), unindentRaw`
    INSERT INTO "user" t ("id") VALUES
    (7)
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id"
  `)
})

test('upsert with sql.insert on minimal columns but no skipEqual', async t => {
  let error

  try {
    sql.insert({
      into: 'user',
      data: { id: 7 },
      onConflict: 'id',
      update: true,
    })
    .text
  } catch (e) {
    error = e
  }

  t.is(error.message, 'no columns to update')
})
