'use strict'

let tmpResolve
const setTmpResolve = r => { tmpResolve = r }

class Mutex {
  constructor () {
    this.released = null
  }

  async lock () {
    const prevReleased = this.released
    this.released = new Promise(setTmpResolve)
    const unlock = tmpResolve
    tmpResolve = null
    await prevReleased
    return unlock
  }
}

module.exports = {
  Mutex,
}