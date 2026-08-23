import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config, configWarnings, missingConfig } from './config.js'
import { api } from './routes.js'

/**
 * One server for both halves: it serves the built React app and answers /api
 * from the same origin. Same origin means no CORS to configure and no second
 * deployment to keep in step.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(here, '..', 'dist')

const app = express()

// Behind Hostinger's proxy, so req.protocol and the client IP are only correct
// once the forwarded headers are trusted.
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(express.json({ limit: '2mb' }))

// Only needed when the app is served from somewhere else — a Vite dev server on
// another port. Same-origin requests never reach this.
app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && config.allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.set('Access-Control-Max-Age', '86400')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
  }
  next()
})

app.use('/api', api)

// Mounted unconditionally, and dist/ is checked per request rather than once at
// import. If the frontend is built after the server starts, it starts working
// on its own — no restart, and no need to decide at boot whether it exists.
const indexHtml = path.join(distDir, 'index.html')

app.use(
  // Hashed asset filenames can be cached hard; index.html must never be, or a
  // deploy leaves people on the old bundle.
  express.static(distDir, {
    index: false,
    fallthrough: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache')
      else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  }),
)

// Single-page app: any path that is not a file and not /api is the app itself.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.set('Cache-Control', 'no-cache')

  if (!fs.existsSync(indexHtml)) {
    return res
      .status(503)
      .type('text/plain')
      .send('The frontend has not been built yet. The API is running — try /api/ping.')
  }

  res.sendFile(indexHtml)
})

/**
 * A managed host shows a 503 when it cannot reach the process, and its runtime
 * log is often the only clue. So: never die silently, and say enough at boot to
 * diagnose the usual causes from the log alone.
 */
process.on('uncaughtException', (err) => {
  console.error('[kalope] UNCAUGHT EXCEPTION — staying up:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[kalope] UNHANDLED REJECTION — staying up:', reason)
})

// Bind to every interface: a managed host routes to the container's address,
// not to loopback.
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[kalope] listening on 0.0.0.0:${config.port}`)
  console.log(
    process.env.PORT
      ? `[kalope] port came from the PORT variable (${process.env.PORT})`
      : '[kalope] PORT was not set, so 3000 was assumed. If the host expects another port, ' +
          'this is why the site returns 503 — do not hardcode it, let the host set PORT.',
  )
  console.log(`[kalope] node ${process.version}, cwd ${process.cwd()}`)
  console.log(
    fs.existsSync(distDir)
      ? `[kalope] serving the app from ${distDir}`
      : `[kalope] NO FRONTEND at ${distDir} — the build did not run. Only /api works.`,
  )

  // Say what is wrong at boot rather than waiting for someone to hit a 500.
  const missing = missingConfig()
  if (missing.length) {
    console.warn(`[kalope] NOT CONFIGURED — missing: ${missing.join(', ')}`)
    console.warn('[kalope] the app will start, but nobody can sign in. Check /api/health.')
  }
  for (const warning of configWarnings()) console.warn(`[kalope] ${warning}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[kalope] port ${config.port} is already in use — another copy is probably still running.`)
  } else if (err.code === 'EACCES') {
    console.error(`[kalope] not allowed to bind port ${config.port}. Let the host set PORT instead.`)
  } else {
    console.error('[kalope] could not start listening:', err)
  }
  process.exit(1)
})
