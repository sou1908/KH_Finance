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

import { ensureBuilt } from './server/prestart.mjs'

ensureBuilt()

await import('./server/index.js')
