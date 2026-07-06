/** Allows CLI scripts (sync-listings) to import modules that use `server-only`. */
const Module = require('module')
const originalLoad = Module._load
Module._load = function stubServerOnly(request, parent, isMain) {
  if (request === 'server-only') {
    return {}
  }
  return originalLoad.call(this, request, parent, isMain)
}
