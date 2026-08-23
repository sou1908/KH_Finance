/**
 * Builds the frontend if the deploy did not.
 *
 * Some hosts run only the start command and skip the build step — the app then
 * boots with no dist/ and serves nothing. Rather than fail, build it here.
 *
 * Never fatal: if the build cannot run (vite pruned by a production install,
 * for instance) the API is still worth starting, and the server says plainly
 * that the app has not been built.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(here, '..')

export function ensureBuilt() {
  if (existsSync(path.join(projectRoot, 'dist', 'index.html'))) return true

  console.log('[kalope] dist/ is missing — building the frontend before starting.')

  let result
  try {
    result = spawnSync('npm', ['run', 'build'], {
      cwd: projectRoot,
      stdio: 'inherit',
      // npm is a shell script on Windows; without this, spawn cannot find it.
      shell: process.platform === 'win32',
      // A host that kills a slow start would show a 503 with no explanation.
      // Better to give up on the build and let the server come up and say so.
      timeout: 180_000,
    })
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
