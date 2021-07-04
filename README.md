# Hrid
PG library for truly ACID transactions

## Why?
Hrid is born from the need to have a transaction management that will automatically serialize execution of (sub)transactions that share same DB connection.

Basicity, you wrap your code in `db.tx(t => {...})` any time that a block should be transactional (atomic). No need to wary about what can or should not run concurrently depending on if `db` already runs in a single connection (transaction). When something makes sense to run concurrently, do it, use `Promise.all`, and Hrid will automatically serialize execution when required so that queries of different transactions are not mixed together.

## Installation

```
npm i pg hrid
```

## Setup

Your `db.js` could look like:

```js
const pg = require('pg')
const { Database, sql } = require('hrid')

// Don't store DB dates in Date!
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
