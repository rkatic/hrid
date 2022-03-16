'use strict'

const test = require('tape')
const { delay } = require('./helpers')
const { Mutex } = require('../lib/utils/mutex')

test('sequential locking', async t => {
  const mutex = new Mutex()
  let seq = []

  const job = async n => {
    const lock = await mutex.lock()
    seq.push(n)
    delay(10)
    seq.push(-n)

    lock.release()
  }

  await Promise.all([1, 2, 3, 4, 5].map(job))

  t.deepEqual(seq, [1, -1, 2, -2, 3, -3, 4, -4, 5, -5])
})