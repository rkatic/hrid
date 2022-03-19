'use strict'

let tmpResolve
const setTmpResolve = r => { tmpResolve = r }

class Mutex {
  constructor () {
    this.unlocked = null
  }

  async lock () {
    const prevUnlocked = this.unlocked
    this.unlocked = new Promise(setTmpResolve)
    const unlock = tmpResolve
    tmpResolve = null
    await prevUnlocked
    return unlock
  }
}

module.exports = {
  Mutex,
}