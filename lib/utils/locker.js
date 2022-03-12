'use strict'

function createLocker () {
  let p = null
  let unlock = null
  const setUnlock = x => { unlock = x }

  const lock = async () => {
    const prev = p
    p = new Promise(setUnlock)
    const r = unlock
    await prev
    return r
  }

  return { lock }
}

module.exports = {
  createLocker,
}