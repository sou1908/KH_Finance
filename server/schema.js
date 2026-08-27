import { getPool } from './db.js'
import { config } from './config.js'
import { hashPassword } from './auth.js'
import { newId } from './ids.js'

/**
 * The schema, and the only definition of it.
 *
 * Tables are created and repaired on first connection, so there is no SQL file
 * to paste and nothing to keep in step by hand.
 *
 * This exists because of a specific trap: CREATE TABLE IF NOT EXISTS silently
 * skips a table that already exists — columns included. Add a field later and
 * it never reaches the live database; the deploy succeeds and every query
 * touching that column dies with "Unknown column". So on boot the declared
 * columns below are compared against information_schema and anything missing is
 * added. Columns are only ever ADDED — never dropped, never retyped.
 *
 * Dialect rules, because the server version is not ours to choose:
 *   - No DEFAULT on a TEXT column (needs MySQL 8.0.13+).
 *   - No DEFAULT that calls a function, except CURRENT_TIMESTAMP on a datetime.
 *   - Single-quoted string literals, so a server with ANSI_QUOTES still parses.
 *   - Money is DECIMAL. Never FLOAT: floats round wrong, and a ledger that
 *     rounds wrong is worthless.
 */

export const SCHEMA_VERSION = 5

export const SCHEMA = {
  app_meta: {
    columns: {
      k: 'VARCHAR(64) NOT NULL',
      v: "VARCHAR(255) NOT NULL DEFAULT ''",
    },
    primary: '(k)',
  },

  users: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      email: 'VARCHAR(190) NOT NULL',
      password_hash: 'VARCHAR(255) NOT NULL',
      name: "VARCHAR(120) NOT NULL DEFAULT ''",
      role: "VARCHAR(20) NOT NULL DEFAULT 'owner'",
      created_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    },
    primary: '(id)',
    keys: ['UNIQUE KEY uniq_users_email (email)'],
  },

  sessions: {
    columns: {
      token: 'CHAR(64) NOT NULL',
      user_id: 'VARCHAR(40) NOT NULL',
      created_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
      expires_at: 'DATETIME NOT NULL',
    },
    primary: '(token)',
    keys: ['KEY idx_sessions_user (user_id)', 'KEY idx_sessions_expiry (expires_at)'],
  },

  clients: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      name: 'VARCHAR(190) NOT NULL',
      phone: "VARCHAR(40) NOT NULL DEFAULT ''",
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_clients_live (deleted_at)'],
  },

  accounts: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      name: 'VARCHAR(190) NOT NULL',
      kind: "VARCHAR(30) NOT NULL DEFAULT 'cash'",
      holder: "VARCHAR(190) NOT NULL DEFAULT ''",
      opening_balance: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_accounts_live (deleted_at)'],
  },

  categories: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      name: 'VARCHAR(190) NOT NULL',
      unit: "VARCHAR(40) NOT NULL DEFAULT ''",
      tracks_inventory: 'TINYINT(1) NOT NULL DEFAULT 0',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_categories_live (deleted_at)'],
  },

  /** Shops and contractors, so a vendor name is picked rather than retyped. */
  vendors: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      name: 'VARCHAR(190) NOT NULL',
      phone: "VARCHAR(40) NOT NULL DEFAULT ''",
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_vendors_live (deleted_at)'],
  },

  /**
   * The things you buy, each under one head.
   *
   * A bill still stores the item's name as its own description rather than a
   * reference. Renaming an item later must not silently rewrite what a bill
   * from last March said was bought — the bill is the record, the list is only
   * how it gets typed.
   */
  items: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      category_id: 'VARCHAR(40) NULL',
      name: 'VARCHAR(190) NOT NULL',
      unit: "VARCHAR(40) NOT NULL DEFAULT ''",
      rate: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_items_category (category_id)', 'KEY idx_items_live (deleted_at)'],
  },

  projects: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      name: 'VARCHAR(190) NOT NULL',
      client_id: 'VARCHAR(40) NULL',
      phone: "VARCHAR(40) NOT NULL DEFAULT ''",
      site: "VARCHAR(190) NOT NULL DEFAULT ''",
      quoted_amount: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      start_date: 'DATE NULL',
      status: "VARCHAR(20) NOT NULL DEFAULT 'Active'",
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_projects_client (client_id)', 'KEY idx_projects_live (deleted_at)'],
  },

  receipts: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      project_id: 'VARCHAR(40) NOT NULL',
      date: 'DATE NULL',
      amount: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      account_id: 'VARCHAR(40) NULL',
      mode: "VARCHAR(40) NOT NULL DEFAULT ''",
      reference: "VARCHAR(190) NOT NULL DEFAULT ''",
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: [
      'KEY idx_receipts_project (project_id, date)',
      'KEY idx_receipts_account (account_id)',
      'KEY idx_receipts_live (deleted_at)',
    ],
  },

  expenses: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      project_id: 'VARCHAR(40) NOT NULL',
      date: 'DATE NULL',
      category_id: 'VARCHAR(40) NULL',
      account_id: 'VARCHAR(40) NULL',
      vendor: "VARCHAR(190) NOT NULL DEFAULT ''",
      description: 'TEXT NULL',
      qty: 'DECIMAL(14,3) NOT NULL DEFAULT 0',
      unit: "VARCHAR(40) NOT NULL DEFAULT ''",
      rate: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      amount: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      bill_no: "VARCHAR(80) NOT NULL DEFAULT ''",
      used_qty: 'DECIMAL(14,3) NOT NULL DEFAULT 0',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: [
      'KEY idx_expenses_project (project_id, date)',
      'KEY idx_expenses_category (category_id)',
      'KEY idx_expenses_account (account_id)',
      'KEY idx_expenses_live (deleted_at)',
    ],
  },

  /**
   * Money moved between our own accounts.
   *
   * Deliberately its own table rather than a flag on receipts or expenses: a
   * transfer must never be able to leak into a project's income or spending,
   * and separate tables make that structural instead of something a query has
   * to remember to exclude. project_id is an earmark — why the money moved —
   * never a claim that the project earned it.
   */
  transfers: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      date: 'DATE NULL',
      amount: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      from_account_id: 'VARCHAR(40) NULL',
      to_account_id: 'VARCHAR(40) NULL',
      project_id: 'VARCHAR(40) NULL',
      mode: "VARCHAR(40) NOT NULL DEFAULT ''",
      reference: "VARCHAR(190) NOT NULL DEFAULT ''",
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: [
      'KEY idx_transfers_from (from_account_id, date)',
      'KEY idx_transfers_to (to_account_id, date)',
      'KEY idx_transfers_project (project_id)',
      'KEY idx_transfers_live (deleted_at)',
    ],
  },

  attachments: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      owner_type: "VARCHAR(20) NOT NULL DEFAULT ''",
      owner_id: "VARCHAR(40) NOT NULL DEFAULT ''",
      name: "VARCHAR(255) NOT NULL DEFAULT ''",
      mime: "VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream'",
      size: 'INT UNSIGNED NOT NULL DEFAULT 0',
      path: "VARCHAR(255) NOT NULL DEFAULT ''",
      uploaded_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_attachments_owner (owner_type, owner_id)', 'KEY idx_attachments_live (deleted_at)'],
  },

  audit_log: {
    columns: {
      id: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
      user_id: 'VARCHAR(40) NULL',
      op: "VARCHAR(20) NOT NULL DEFAULT ''",
      entity: "VARCHAR(30) NOT NULL DEFAULT ''",
      row_id: 'VARCHAR(40) NULL',
      payload: 'LONGTEXT NULL',
      created_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    },
    primary: '(id)',
    keys: ['KEY idx_audit_entity (entity, row_id)', 'KEY idx_audit_time (created_at)'],
  },
}

const SEED_ACCOUNTS = [
  ['acc_cash', 'Cash', 'cash', ''],
  ['acc_personal_a', 'Personal A/C — A', 'personal', 'A'],
  ['acc_personal_b', 'Personal A/C — B', 'personal', 'B'],
  ['acc_company', 'Company A/C', 'company', 'Kalope Homes'],
]

const SEED_CATEGORIES = [
  ['cat_sheet', 'Sheet', 'sheet', 1],
  ['cat_fare', 'Fare', 'trip', 0],
  ['cat_hardware', 'Hardware', 'pcs', 1],
  ['cat_labour', 'Labour', 'day', 0],
  ['cat_designer', 'Designer', 'job', 0],
  ['cat_electric', 'Electric', 'pcs', 1],
  ['cat_extra', 'Extra', 'item', 0],
]

function createTableSql(table, spec) {
  const parts = Object.entries(spec.columns).map(([column, definition]) => `\`${column}\` ${definition}`)
  if (spec.primary) parts.push(`PRIMARY KEY ${spec.primary}`)
  for (const key of spec.keys ?? []) parts.push(key)

  return `CREATE TABLE IF NOT EXISTS \`${table}\` (\n  ${parts.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
}

/** Exposed so the schema can be inspected without a database. */
export function schemaSql() {
  return Object.entries(SCHEMA)
    .map(([table, spec]) => `${createTableSql(table, spec)};`)
    .join('\n\n')
}

async function currentVersion(conn) {
  try {
    const [rows] = await conn.query("SELECT v FROM app_meta WHERE k = 'schema_version' LIMIT 1")
    return rows.length ? Number(rows[0].v) : null
  } catch {
    // app_meta itself does not exist yet: a brand new database.
    return null
  }
}

let ensured = false

/**
 * Creates anything missing and adds any column the live database has not seen.
 * Runs once per process; `force` re-checks (used by /health).
 *
 * @returns {Promise<{ran: boolean, added: string[], adminCreated: boolean}>}
 */
export async function ensureSchema({ force = false } = {}) {
  if (ensured && !force) return { ran: false, added: [], adminCreated: false }

  const conn = await getPool().getConnection()
  try {
    const version = await currentVersion(conn)
    if (!force && version === SCHEMA_VERSION) {
      ensured = true
      return { ran: false, added: [], adminCreated: false }
    }

    for (const [table, spec] of Object.entries(SCHEMA)) {
      await conn.query(createTableSql(table, spec))
    }

    // The repair pass. This is the part CREATE TABLE IF NOT EXISTS cannot do.
    const added = []
    for (const [table, spec] of Object.entries(SCHEMA)) {
      const [live] = await conn.execute(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [config.db.database, table],
      )
      const present = new Set(live.map((r) => String(r.COLUMN_NAME).toLowerCase()))

      for (const [column, definition] of Object.entries(spec.columns)) {
        if (present.has(column.toLowerCase())) continue
        // Backticked: `k` and `date` are reserved-ish words.
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
        added.push(`${table}.${column}`)
      }
    }

    await seedMasters(conn)
    const adminCreated = await ensureAdmin(conn)

    await conn.execute(
      "INSERT INTO app_meta (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
      [String(SCHEMA_VERSION)],
    )

    ensured = true
    return { ran: true, added, adminCreated }
  } finally {
    conn.release()
  }
}

/** INSERT IGNORE, so a firm that renamed or deleted a head keeps its changes. */
async function seedMasters(conn) {
  for (const row of SEED_ACCOUNTS) {
    await conn.execute('INSERT IGNORE INTO accounts (id, name, kind, holder) VALUES (?, ?, ?, ?)', row)
  }
  for (const row of SEED_CATEGORIES) {
    await conn.execute('INSERT IGNORE INTO categories (id, name, unit, tracks_inventory) VALUES (?, ?, ?, ?)', row)
  }
}

/**
 * Creates the first login from ADMIN_EMAIL / ADMIN_PASSWORD, once.
 *
 * Only when the users table is empty — so changing ADMIN_PASSWORD later never
 * silently resets a password somebody has already changed in the app.
 */
async function ensureAdmin(conn) {
  const { email, password } = config.admin
  if (!email || !password) return false

  const [rows] = await conn.query('SELECT COUNT(*) AS n FROM users')
  if (Number(rows[0].n) > 0) return false

  await conn.execute('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)', [
    newId('usr'),
    email,
    await hashPassword(password),
    'Kalope Homes',
    'owner',
  ])

  console.log(`[kalope] created the first login for ${email}`)
  return true
}
