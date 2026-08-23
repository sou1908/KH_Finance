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

if (fs.existsSync(distDir)) {
  // Hashed asset filenames can be cached hard; index.html must never be, or a
  // deploy leaves people on the old bundle.
  app.use(
    express.static(distDir, {
      index: false,
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
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else {
  app.get('/', (req, res) =>
    res
      .status(503)
      .type('text/plain')
      .send('The app has not been built yet. Run "npm run build", then start the server again.'),
  )
}

// Bind to every interface: a managed host routes to the container's address,
// not to loopback.
app.listen(config.port, '0.0.0.0', () => {
  console.log(`[kalope] listening on ${config.port}`)

  // Say what is wrong at boot rather than waiting for someone to hit a 500.
  const missing = missingConfig()
  if (missing.length) {
    console.warn(`[kalope] NOT CONFIGURED — missing: ${missing.join(', ')}`)
    console.warn('[kalope] the app will start, but nobody can sign in. Check /api/health.')
  }
  for (const warning of configWarnings()) console.warn(`[kalope] ${warning}`)
})
