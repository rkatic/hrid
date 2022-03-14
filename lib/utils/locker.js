'use strict'

function Lock (released, release) {
  this.released = released
  this.release = release
}

function createLocker () {
  let p = null
  let resolve = null
  const setResolve = r => { resolve = r }

  const lock = async () => {
    const prev = p
    p = new Promise(setResolve)
    const lock = new Lock(p, resolve)
    await prev
    return lock
  }

  return { lock }
}

module.exports = {
  createLocker,
}