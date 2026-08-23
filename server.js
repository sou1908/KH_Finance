/**
 * Root entry point.
 *
 * The real server lives in server/index.js. This file exists because hosting
 * panels commonly default their "Entry File" to `server.js` at the repository
 * root, and a missing entry file fails the deploy after a build that looked
 * perfectly successful.
 *
 * Starting the app any of these ways does the same thing:
 *
 *   npm start            → prestart builds if needed, then server/index.js
 *   node server.js       → this file
 *   node server/index.js → the server directly
 *
 * The first two also build the frontend when dist/ is missing, so a platform
 * that skips the build step still comes up.
 */

console.log('[kalope] starting from server.js')

try {
  const { ensureBuilt } = await import('./server/prestart.mjs')
  ensureBuilt()
} catch (err) {
  // A failed build must never stop the server: it is better to come up and
  // report the problem than to leave the host showing an unexplained 503.
  console.warn('[kalope] skipping the build step:', err.message)
}

try {
  await import('./server/index.js')
} catch (err) {
  console.error('[kalope] THE SERVER FAILED TO START:', err)
  process.exit(1)
}
