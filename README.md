# Hrid
PG transaction management done right.

## Why?
Hrid is born from the need to have transaction management that will automatically serialize execution of (sub)transactions that share same DB connection, so that queries of different (sub)transactions are not mixed together.

Additional care is taken in case of rollbacks of transactions, making sure no query will leak in an external execution context.

This allows you to safely use `Promise.all` and to implement reusable code without having to predict/limit the context where it will be used.

## Installation

```
npm i pg hrid
```

## Setup

Your `db.js` could look like:

```js
const pg = require('pg')
const { Database, sql } = require('hrid')

// Don't store DB dates in JS Date!
pg.types.setTypeParser(1082, v => v)

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

const db = new Database(pool)

module.exports = {
  db,
  sql,
}
```

## Use it

```js
const { db, sql } = require('./db')

async function getUserById (id) {
  const [ user ] = await db.query(sql`SELECT * FROM "user" WHERE "id" = ${id}`)
  return user
}

async function updateUser (id, update) {
  await db.tx(async db => {
    const [ user ] = await db.query(sql`
      SELECT * FROM "user"
      WHERE "id" = ${id}
      FOR UPDATE
    `)

    const newUser = update(user)

    await db.update({
      table: 'user',
      where: { id },
      set: newUser,
      skipEqual: true,
    })
  })
}
```