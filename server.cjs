// Printed before anything is imported, so even a crash while loading a module
// leaves a line in the runtime log proving the process started at all.
console.log('[kalope] boot: server.cjs, node ' + process.version + ', PORT=' + (process.env.PORT ?? '(not set)'))

/**
 * CommonJS entry point, for hosts that run the app under Phusion Passenger.
 *
 * Passenger loads its startup file with require(). This package is ESM
 * ("type": "module" in package.json), so require('server.js') fails before a
 * single line of it runs — including the boot log that exists precisely to
 * prove the process started. What you see instead is the proxy's own 503, an
 * empty runtime log, and a build that succeeded perfectly. Nothing in the
 * deployment looks wrong, because nothing in the deployment *is* wrong.
 *
 * A Node version bump does not fix it. Node 20 cannot require() an ES module at
 * all, and Node 22's require(esm) refuses any module containing top-level
 * await — which server.js uses to import the server. The entry point itself has
 * to be CommonJS.
 *
 * A .cjs file is always CommonJS regardless of package.json "type", so Passenger
 * can require() this one, and dynamic import() reaches the real ESM server from
 * inside it. Point the deployment's Entry File at server.cjs.
 *
 * Order matters here, and matches server.js: the port is bound FIRST and
 * anything slow happens after. A managed host waits only a few seconds for the
 * process to start listening; if a build ran first and took thirty seconds, the
 * proxy would give up and serve its own 503 — from an application that was
 * working perfectly.
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
