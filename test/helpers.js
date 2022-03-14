'use strict'

const pg = require('pg')
const Hrid = require('../lib')

// Don't store DB dates in JS Date!
pg.types.setTypeParser(1082, v => v)

function connect (options) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  })

  return new Hrid.Database(pool, options)
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const tick = () => new Promise(resolve => process.nextTick(resolve))

module.exports = {
  connect,
  delay,
  tick,
}