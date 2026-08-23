import os from 'node:os'
import path from 'node:path'

/**
 * Everything the server needs, read from the environment.
 *
 * Nothing here connects to anything. Reading configuration must never fail —
 * a misconfigured app has to start and be able to say what is wrong, because
 * an app that cannot boot can only ever show a blank 500.
 */
export const config = {
  // Never hardcoded. A managed host assigns the port; forcing one makes the
  // app unreachable.
  port: Number(process.env.PORT) || 3000,

  db: {
    // 127.0.0.1, not localhost. MariaDB treats user@localhost, user@127.0.0.1
    // and user@::1 as three separate accounts and grants you one of them; on
    // current systems "localhost" resolves to IPv6 ::1, which matches no grant.
    // The failure is ER_ACCESS_DENIED_ERROR — indistinguishable from a wrong
    // password, with a password that is completely correct.
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    database: process.env.MYSQL_DATABASE || '',
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
  },

  // Bill photos. MUST be outside the deployed folder: a deploy replaces the
  // application directory, uploads are gitignored, so anything stored inside
  // is destroyed on every deploy with no warning.
  uploadDir: process.env.UPLOAD_DIR || path.join(os.homedir(), 'kalope-uploads'),

  // The first login, created once on boot if no user exists yet. Without these
  // the app starts cleanly and nobody can get in.
  admin: {
    email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
  },

  sessionDays: Number(process.env.SESSION_DAYS) || 30,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 12 * 1024 * 1024,

  // Only needed when the app is served from somewhere other than this server —
  // a separate Vite dev server, for instance. Same-origin needs no CORS at all.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
}

/** Which required settings are blank, for /health to report. */
export function missingConfig() {
  const missing = []
  for (const key of ['database', 'user', 'password']) {
    if (!config.db[key]) missing.push(`MYSQL_${key === 'database' ? 'DATABASE' : key.toUpperCase()}`)
  }
  return missing
}

/** Advice worth surfacing even when nothing is strictly wrong. */
export function configWarnings() {
  const warnings = []

  if (config.db.host.includes('localhost')) {
    warnings.push(
      'MYSQL_HOST is "localhost". MariaDB treats that as a different account from 127.0.0.1 and it usually ' +
        'fails as ER_ACCESS_DENIED_ERROR. Run SHOW GRANTS FOR CURRENT_USER() and use exactly the host after the @.',
    )
  }

  if (!config.admin.email || !config.admin.password) {
    warnings.push('ADMIN_EMAIL and ADMIN_PASSWORD are not both set, so no login can be created automatically.')
  }

  const appDir = path.resolve(process.cwd())
  if (path.resolve(config.uploadDir).startsWith(appDir)) {
    warnings.push(
      'UPLOAD_DIR is inside the application folder. A deploy replaces that folder and would delete every ' +
        'bill photo. Point it at a directory outside, such as /home/<account>/kalope-uploads.',
    )
  }

  return warnings
}
