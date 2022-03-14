'use strict'

const test = require('tape')
const { delay } = require('./helpers')
const { createLocker } = require('../lib/utils/locker')

test('sequential locking', async t => {
  const locker = createLocker()

  let seq = []

  const job = async n => {
    const lock = await locker.lock()
    seq.push(n)
    delay(10)
    seq.push(-n)

    lock.release()
  }

  await Promise.all([1, 2, 3, 4, 5].map(job))

  t.deepEqual(seq, [1, -1, 2, -2, 3, -3, 4, -4, 5, -5])
})