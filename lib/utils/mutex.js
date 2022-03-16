'use strict'

let tmpResolve
const setTmpResolve = r => { tmpResolve = r }

function Lock (released, release) {
  this.released = released
  this.release = release
}

class Mutex {
  constructor () {
    this.lastReleased = null
  }

  async lock () {
    const prevReleased = this.lastReleased
    
    this.lastReleased = new Promise(setTmpResolve)
    const lock = new Lock(this.lastReleased, tmpResolve)
    tmpResolve = null

    await prevReleased

    return lock
  }
}

module.exports = {
  Mutex,
}