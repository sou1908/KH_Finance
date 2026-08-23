import mysql from 'mysql2/promise'
import { config } from './config.js'

/**
 * The pool is created on first use, never at import time.
 *
 * `vite build` and any tooling that imports this module must not need a
 * reachable database. Connecting eagerly turns a missing environment variable
 * into a build failure instead of a readable error at runtime.
 */
let pool = null

export function getPool() {
  if (pool) return pool

  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 8,
    // Fail fast. /health is the thing people load when the site is broken, and
    // a health check that hangs for thirty seconds is no help at all.
    connectTimeout: 8000,
    // Shared hosting caps concurrent connections tightly; queueing is kinder
    // than failing, but an unbounded queue just hides a stuck server.
    queueLimit: 50,
    enableKeepAlive: true,
    // DECIMAL and BIGINT come back as strings by default so precision is never
    // lost. Money is converted deliberately at the edge, in rowToJson.
    decimalNumbers: false,
    dateStrings: ['DATE'],
  })

  return pool
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params)
  return rows
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function transaction(fn) {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    try {
      await conn.rollback()
    } catch {
      // The rollback failing does not change what we report.
    }
    throw err
  } finally {
    conn.release()
  }
}

/** Turns a driver error code into the thing to actually go and change. */
export function driverHint(err) {
  switch (err?.code) {
    case 'ER_ACCESS_DENIED_ERROR':
      return (
        'Access denied. Either the password is wrong, or it is right but the grant is for a different host — ' +
        'run SHOW GRANTS FOR CURRENT_USER() and set MYSQL_HOST to exactly the host after the @.'
      )
    case 'ER_BAD_DB_ERROR':
      return 'That database does not exist. Create it in hPanel → Databases.'
    case 'ER_DBACCESS_DENIED_ERROR':
      return 'The user exists but has no rights on that database. Grant it full privileges.'
    case 'ECONNREFUSED':
      return 'Nothing is listening at that host and port. Check MYSQL_HOST and MYSQL_PORT.'
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
      return 'The database host could not be reached. Check MYSQL_HOST.'
    case 'ER_PARSE_ERROR':
      return 'The server rejected the SQL as invalid — usually a feature it is too old for.'
    default:
      return 'Database error. The full message is in the server log.'
  }
}
