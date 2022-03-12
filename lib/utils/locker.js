'use strict'

const noop = () => {}

function Lock (settled, resolve) {
  this.settled = settled
  this.resolve = resolve
}

function createLocker () {
  let p = null
  let resolve = null
  const setResolve = r => { resolve = r }

  const acquireLock = async () => {
    const prev = p
    p = new Promise(setResolve)
    const lock = new Lock(p.then(noop, noop), resolve)
    try {
      await prev
    } catch (e) {
      lock.resolve(prev)
      throw e
    }
    return lock
  }

  return { lock: acquireLock }
}

module.exports = {
  createLocker,
}