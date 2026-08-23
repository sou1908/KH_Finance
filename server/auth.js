import crypto from 'node:crypto'
import { query } from './db.js'
import { config } from './config.js'
import { newToken } from './ids.js'

/**
 * Passwords use Node's built-in scrypt.
 *
 * bcrypt and argon2 are native modules: there is no compiler on CloudLinux and
 * their prebuilt binaries are linked against a newer glibc, so `npm install`
 * dies. scrypt ships with Node, is a proper memory-hard KDF, and adds nothing
 * to the dependency tree.
 */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

const scrypt = (password, salt) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) =>
      err ? reject(err) : resolve(key),
    )
  })

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt)
  // Parameters travel with the hash, so they can be raised later without
  // invalidating existing passwords.
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, keyHex] = String(stored).split('$')
    if (scheme !== 'scrypt') return false

    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(keyHex, 'hex')

    const actual = await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, expected.length, { N: Number(N), r: Number(r), p: Number(p) }, (err, key) =>
        err ? reject(err) : resolve(key),
      )
    })

    // Constant time, so a wrong password cannot be narrowed down by timing.
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export async function createSession(userId) {
  const token = newToken()
  await query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))', [
    token,
    userId,
    config.sessionDays,
  ])

  // Occasional housekeeping rather than a cron job.
  if (Math.random() < 0.05) {
    query('DELETE FROM sessions WHERE expires_at < NOW()').catch(() => {})
  }

  return token
}

function bearer(req) {
  const header = req.get('authorization') || ''
  const match = /^Bearer\s+([A-Za-z0-9]+)$/.exec(header)
  return match ? match[1] : null
}

/** Attaches req.user, or answers 401. */
export async function requireUser(req, res, next) {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  try {
    const rows = await query(
      `SELECT u.id, u.email, u.name, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > NOW()
        LIMIT 1`,
      [token],
    )

    if (!rows.length) {
      return res.status(401).json({ error: 'Your session has expired. Sign in again.' })
    }

    req.user = rows[0]
    req.token = token
    next()
  } catch (err) {
    next(err)
  }
}

export async function destroySession(req) {
  const token = bearer(req)
  if (token) await query('DELETE FROM sessions WHERE token = ?', [token]).catch(() => {})
}
