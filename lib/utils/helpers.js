'use strict'

function bindAsyncCallStack (fn, toFn, header = 'After:') {
  const fakeError = {}
  Error.captureStackTrace(fakeError, toFn || bindAsyncCallStack)

  return async function (...args) {
    try {
      return await fn.apply(this, args)
    } catch (e) {
      if (e instanceof Error) {
        Object.defineProperty(e, 'stack', {
          value: `${e.stack}\n${header}\n${fakeError.stack.replace(/^.*?\n/, '')}`,
          configurable: true,
        })
      }
      throw e
    }
  }
}

exports.bindAsyncCallStack = bindAsyncCallStack
