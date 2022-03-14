'use strict'

function Lock (released, release) {
  this.released = released
  this.release = release
}

function createLocker () {
  let lastReleased = null
  let resolve = null
  const setResolve = r => { resolve = r }

  const lock = async () => {
    const prevReleased = lastReleased
    lastReleased = new Promise(setResolve)
    const lock = new Lock(lastReleased, resolve)
    resolve = null
    await prevReleased
    return lock
  }

  return { lock }
}

module.exports = {
  createLocker,
}