import express from 'express'
import multer from 'multer'
import { config, configWarnings, missingConfig } from './config.js'
import { driverHint, getPool, query, transaction } from './db.js'
import { SCHEMA_VERSION, ensureSchema } from './schema.js'
import { createSession, destroySession, requireUser, verifyPassword } from './auth.js'
import { applyOp, loadState } from './sync.js'
import { newId } from './ids.js'
import { readFile, sniffType, uploadDirStatus, writeFile } from './files.js'

export const api = express.Router()

// Held in memory then written under our own name — a bill photo is a few MB and
// this keeps the type check and the disk write in one place.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
})

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/* ------------------------------------------------------------------ health */

/**
 * Open by design — no session required.
 *
 * It exists precisely for the case where nobody can log in, so putting it
 * behind auth would defeat it. Reports codes and counts only: never a host,
 * user, database name or password.
 */
api.get('/health', async (req, res) => {
  const out = { service: 'kalope-finance-api', time: new Date().toISOString() }
  let step = 'config'

  try {
    const missing = missingConfig()
    if (missing.length) {
      return res.status(500).json({ ...out, ok: false, step, error: `Not set: ${missing.join(', ')}` })
    }

    const warnings = configWarnings()

    step = 'connect'
    const [[server]] = await getPool().query('SELECT VERSION() AS v')
    out.server = server.v

    step = 'schema'
    const migration = await ensureSchema({ force: true })
    out.schemaVersion = SCHEMA_VERSION
    if (migration.ran) out.migrated = true
    if (migration.added.length) out.columnsAdded = migration.added
    if (migration.adminCreated) out.adminCreated = true

    step = 'query'
    out.rows = {}
    for (const table of ['users', 'projects', 'receipts', 'expenses', 'attachments']) {
      const [[row]] = await getPool().query(`SELECT COUNT(*) AS n FROM \`${table}\``)
      out.rows[table] = Number(row.n)
    }

    step = 'uploads'
    out.uploads = await uploadDirStatus()
    if (!out.uploads.writable) {
      warnings.push('UPLOAD_DIR is missing or not writable, so bill photos cannot be saved.')
    }

    if (out.rows.users === 0) {
      warnings.push('No login exists. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart.')
    }

    if (warnings.length) out.warnings = warnings
    res.json({ ...out, ok: true })
  } catch (err) {
    console.error(`[kalope] health failed at ${step}:`, err.message)
    res.status(500).json({ ...out, ok: false, step, code: err.code ?? null, error: driverHint(err) })
  }
})

/* -------------------------------------------------------------------- auth */

api.post(
  '/auth/login',
  wrap(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')

    if (!email || !password) {
      return res.status(400).json({ error: 'Enter your email and password.' })
    }

    await ensureSchema()
    const rows = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [email])
    const user = rows[0]

    // Same message and similar timing whether the email or the password was
    // wrong, so this cannot be used to discover which emails exist.
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 200))
      return res.status(401).json({ error: 'That email and password do not match.' })
    }

    const token = await createSession(user.id)
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
  }),
)

api.post(
  '/auth/logout',
  wrap(async (req, res) => {
    await destroySession(req)
    res.json({ ok: true })
  }),
)

api.get('/auth/me', requireUser, (req, res) => res.json({ user: req.user }))

/* ------------------------------------------------------------------ ledger */

/** The whole ledger in one response — what the app loads on sign-in. */
api.get(
  '/state',
  requireUser,
  wrap(async (req, res) => {
    await ensureSchema()
    const conn = await getPool().getConnection()
    try {
      res.json(await loadState(conn))
    } finally {
      conn.release()
    }
  }),
)

/**
 * The single write endpoint. The app sends a batch of queued operations; each
 * is applied in order inside one transaction, so a half-applied batch is
 * impossible. Re-sending a batch is harmless — writes are upserts keyed by the
 * id the browser generated.
 */
api.post(
  '/sync',
  requireUser,
  wrap(async (req, res) => {
    const ops = req.body?.ops
    if (!Array.isArray(ops)) return res.status(400).json({ error: 'Expected a list of operations.' })
    if (ops.length > 500) return res.status(413).json({ error: 'Too many operations in one batch.' })

    await ensureSchema()

    try {
      const applied = await transaction(async (conn) => {
        const ids = []
        for (const op of ops) {
          await applyOp(conn, op, req.user.id)
          ids.push(op?.id ?? null)
        }
        return ids
      })

      res.json({ applied, count: applied.length })
    } catch (err) {
      console.error('[kalope] sync failed:', err.message)
      // 422 tells the browser this batch will never succeed, so it is set aside
      // and reported rather than retried into a wall forever.
      res.status(422).json({ error: `That batch could not be saved: ${err.message}` })
    }
  }),
)

/* ------------------------------------------------------------------- files */

api.post(
  '/files',
  requireUser,
  upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file arrived. It may be larger than the server allows.' })
    }

    const kind = sniffType(req.file.buffer)
    if (!kind) return res.status(415).json({ error: 'Only photos and PDFs can be attached.' })

    const id = String(req.body?.id ?? '').replace(/[^A-Za-z0-9_]/g, '') || newId('att')
    const name = String(req.file.originalname ?? 'attachment').slice(0, 255)

    const storedName = await writeFile(id, kind.ext, req.file.buffer)

    await ensureSchema()
    await query(
      `INSERT INTO attachments (id, owner_type, owner_id, name, mime, size, path)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), mime = VALUES(mime),
                               size = VALUES(size), path = VALUES(path), deleted_at = NULL`,
      [
        id,
        String(req.body?.ownerType ?? ''),
        String(req.body?.ownerId ?? ''),
        name,
        kind.mime,
        req.file.size,
        storedName,
      ],
    )

    res.json({ id, name, type: kind.mime, size: req.file.size })
  }),
)

api.get(
  '/files/:id',
  requireUser,
  wrap(async (req, res) => {
    const rows = await query('SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL LIMIT 1', [
      req.params.id,
    ])
    const meta = rows[0]
    if (!meta) return res.status(404).json({ error: 'That file is not on the server.' })

    let bytes
    try {
      bytes = await readFile(meta.path)
    } catch {
      return res.status(410).json({ error: 'That file is missing from storage.' })
    }

    res.set('Content-Type', meta.mime)
    res.set('Content-Disposition', `inline; filename="${meta.name.replace(/"/g, '')}"`)
    res.set('Cache-Control', 'private, max-age=86400')
    res.send(bytes)
  }),
)

api.delete(
  '/files/:id',
  requireUser,
  wrap(async (req, res) => {
    await query('UPDATE attachments SET deleted_at = NOW() WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  }),
)

/* ---------------------------------------------------------------- fallback */

api.use((req, res) => res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` }))

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
api.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `That file is larger than ${Math.round(config.maxUploadBytes / 1048576)} MB.` })
  }
  console.error('[kalope] API error:', err)
  res.status(500).json({ error: 'Something went wrong on the server. It has been logged.' })
})
