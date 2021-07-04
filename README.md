# Hrid
PG library for truly ACID transactions

## Why?
Hrid is born from the need to have transaction management that will automatically serialize execution of (sub)transactions that share same DB connection, so that queries of different (sub)transactions are not mixed together.

Additional care is taken in case of rollbacks of transactions, making sure no query will leak out in an external execution context.

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

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

const db = new Database(pgPool, {
  debug: process.env.NODE_ENV !== 'production',
})

module.exports = {
  db,
  sql,
}
```

## Use it

```js
const { db } = require('./db')

async function getUserById (id) {
  const [ user ] = await db.sql`SELECT * FROM "user" WHERE "id" = ${id}`
  return user
}
```
