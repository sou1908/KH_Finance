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
 * Order matters here. The port is bound FIRST and anything slow happens after.
 * A managed host waits only a few seconds for the process to start listening;
 * if a build ran first and took thirty seconds, the proxy would give up and
 * serve its own 503 — from an application that was working perfectly.
 */

try {
  await import('./server/index.js')
} catch (err) {
  console.error('[kalope] THE SERVER FAILED TO START:', err)
  process.exit(1)
}

// Now that the port is answering, build the frontend if the deploy did not.
// Until it finishes, /api works and page requests explain themselves.
try {
  const { ensureBuiltAsync } = await import('./server/prestart.mjs')
  ensureBuiltAsync()
} catch (err) {
  console.warn('[kalope] skipping the build step:', err.message)
}
