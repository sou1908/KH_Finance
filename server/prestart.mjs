/**
 * Builds the frontend if the deploy did not.
 *
 * Some hosts run only `npm start` and skip the build step — the app then boots
 * with no dist/ and serves nothing. Rather than fail, build it here.
 *
 * Never fatal: if the build cannot run (vite pruned by a production install,
 * for instance) the API is still worth starting, and the server says plainly
 * that the app has not been built.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const indexHtml = path.join(here, '..', 'dist', 'index.html')

if (existsSync(indexHtml)) {
  process.exit(0)
}

console.log('[kalope] dist/ is missing — building the frontend before starting.')

const result = spawnSync('npm', ['run', 'build'], {
  cwd: path.join(here, '..'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.status !== 0) {
  console.warn('[kalope] the build did not succeed. The API will still start; the page will say so.')
}

process.exit(0)
