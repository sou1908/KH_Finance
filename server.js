// Printed before anything is imported, so even a crash while loading a module
// leaves a line in the runtime log proving the process started at all.
console.log('[kalope] boot: server.js, node ' + process.version + ', PORT=' + (process.env.PORT ?? '(not set)'))

/**
 * Root entry point.
 *
 * The real server lives in server/index.js. This file exists because hosting
 * panels commonly default their "Entry File" to `server.js` at the repository
 * root, and a missing entry file fails the deploy after a build that looked
 * perfectly successful.
 *
 * NO TOP-LEVEL AWAIT IN THIS FILE. It looks like a harmless way to write the
 * two imports below, and it silently breaks the only host that matters.
 *
 * Passenger — which Hostinger runs the app under — loads its startup file with
 * require(). This package is ESM ("type": "module"), and Node's require(esm)
 * refuses any module containing top-level await: the module is asynchronous, so
 * there is no way to hand it back from a synchronous require(). The file fails
 * before line 3 runs, and the symptom is the proxy's own 503 on every route
 * with an empty runtime log — after a build that installed, compiled and
 * published without a single warning.
 *
 * Written as promise chains instead, the module is synchronous, require(esm)
 * accepts it, and the same code runs unchanged under `node server.js`.
 *
 * server.cjs is the belt-and-braces version for hosts on older Node, where
 * require(esm) does not exist at all. Either entry file works.
 *
 * Order matters here. The port is bound FIRST and anything slow happens after.
 * A managed host waits only a few seconds for the process to start listening;
 * if a build ran first and took thirty seconds, the proxy would give up and
 * serve its own 503 — from an application that was working perfectly.
 */

import('./server/index.js')
  .then(() => {
    // Now that the port is answering, build the frontend if the deploy did not.
    // Until it finishes, /api works and page requests explain themselves.
    return import('./server/prestart.mjs')
      .then(({ ensureBuiltAsync }) => ensureBuiltAsync())
      .catch((err) => console.warn('[kalope] skipping the build step:', err.message))
  })
  .catch((err) => {
    console.error('[kalope] THE SERVER FAILED TO START:', err)
    process.exit(1)
  })
