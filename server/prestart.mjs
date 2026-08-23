/**
 * Builds the frontend if the deploy did not.
 *
 * Some hosts run only the start command and skip the build step — the app then
 * boots with no dist/ and serves nothing. Rather than fail, build it here.
 *
 * Two flavours, and the difference matters:
 *
 *   ensureBuiltAsync()  starts the build and returns immediately. Used once the
 *                       port is already bound, so a slow build can never delay
 *                       the process becoming reachable. A host that waits only
 *                       a few seconds for a listener would otherwise show its
 *                       own 503 for an application that was working perfectly.
 *
 *   ensureBuilt()       blocks. Only for `npm run prestart`, which runs before
 *                       the server exists and therefore has nothing to delay.
 *
 * Neither is ever fatal: if the build cannot run — vite pruned by a production
 * install, npm missing from the runtime PATH — the API is still worth starting,
 * and page requests say plainly that the frontend is not built.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(here, '..')
const indexHtml = path.join(projectRoot, 'dist', 'index.html')

const spawnOptions = { cwd: projectRoot, stdio: 'inherit' }

/**
 * Runs vite with the Node binary already executing, rather than going through
 * npm. Two reasons: npm is not always on a managed host's runtime PATH, and on
 * Windows it is a .cmd shim that Node refuses to spawn without a shell.
 *
 * @returns {[string, string[]] | null} argv for spawn, or null if vite is gone.
 */
function buildCommand() {
  // Straight at the file. require.resolve('vite/bin/vite.js') does not work:
  // vite's package "exports" map does not expose its own bin path.
  const direct = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  if (existsSync(direct)) return [process.execPath, [direct, 'build']]

  // Hoisted differently, e.g. in a workspace.
  try {
    const require = createRequire(import.meta.url)
    const pkg = require.resolve('vite/package.json')
    const hoisted = path.join(path.dirname(pkg), 'bin', 'vite.js')
    if (existsSync(hoisted)) return [process.execPath, [hoisted, 'build']]
  } catch {
    // Falls through to null below.
  }

  // vite is a devDependency; a production install may have pruned it.
  return null
}

export function alreadyBuilt() {
  return existsSync(indexHtml)
}

/** Non-blocking. Safe to call after the server is already listening. */
export function ensureBuiltAsync() {
  if (alreadyBuilt()) return

  const command = buildCommand()
  if (!command) {
    console.warn('[kalope] vite is not installed, so the frontend cannot be built here.')
    console.warn('[kalope] set the deploy build command to "npm run build".')
    return
  }

  console.log('[kalope] dist/ is missing — building the frontend in the background.')
  console.log('[kalope] the API is already answering; page requests will work once this finishes.')

  let child
  try {
    child = spawn(command[0], command[1], spawnOptions)
  } catch (err) {
    console.warn('[kalope] could not run the build:', err.message)
    return
  }

  child.on('error', (err) => {
    console.warn('[kalope] could not run the build:', err.message)
    console.warn('[kalope] set the deploy build command to "npm run build".')
  })

  child.on('exit', (code) => {
    if (code === 0) console.log('[kalope] frontend built — the app is now being served.')
    else console.warn(`[kalope] the build exited with code ${code}. The API still works; the page will say so.`)
  })
}

/** Blocking. Only for the prestart script, which runs before the server does. */
export function ensureBuilt() {
  if (alreadyBuilt()) return true

  const command = buildCommand()
  if (!command) {
    console.warn('[kalope] vite is not installed, so the frontend cannot be built here.')
    return false
  }

  console.log('[kalope] dist/ is missing — building the frontend before starting.')

  let result
  try {
    result = spawnSync(command[0], command[1], { ...spawnOptions, timeout: 180_000 })
  } catch (err) {
    console.warn('[kalope] could not run the build:', err.message)
    return false
  }

  if (result.error) {
    console.warn('[kalope] could not run the build:', result.error.message)
    console.warn('[kalope] set the deploy build command to "npm run build".')
    return false
  }

  if (result.status !== 0) {
    console.warn('[kalope] the build did not succeed. The API will still start; the page will say so.')
    return false
  }

  return true
}

// Also usable as a script (`npm run prestart`), not only as an import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensureBuilt()
}
