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

export const SCHEMA_VERSION = 9

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
      // 'project' or 'company'. Defaulting to 'project' is what makes this
      // column safe to add to a live table: every head that already exists was
      // a project head, and stays one without a migration.
      kind: "VARCHAR(20) NOT NULL DEFAULT 'project'",
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_categories_live (deleted_at)'],
  },

  /**
   * Where a company cost was incurred.
   *
   * Two offices today, more later, and some costs — an ad campaign, a software
   * licence — belong to no office at all. Those carry a NULL office_id and read
   * as "company-wide" rather than being forced under one of them.
   */
  offices: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      name: 'VARCHAR(190) NOT NULL',
      address: "VARCHAR(255) NOT NULL DEFAULT ''",
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: ['KEY idx_offices_live (deleted_at)'],
  },

  /**
   * Shops and contractors, so a vendor name is picked rather than retyped.
   *
   * Split by side like the heads are: a plywood shop has no business in the
   * dropdown on an electricity bill, and the landlord has none on a client's.
   * Defaulting to 'project' is what makes the column safe to add to a live
   * table — every vendor saved so far was named on a project bill.
   */
  vendors: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      name: 'VARCHAR(190) NOT NULL',
      phone: "VARCHAR(40) NOT NULL DEFAULT ''",
      kind: "VARCHAR(20) NOT NULL DEFAULT 'project'",
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
   * What happened to the material after it was bought.
   *
   * "Used on site" was a single number on the purchase line, overwritten each
   * time. That cannot say when thirty sheets went to site, who said so, or what
   * happened to the twenty left — and two people editing it clobber each other
   * silently. Each movement is a row instead, so the line carries a history.
   *
   * A movement always points at the purchase line the material came from, and
   * says where it was at the time. Leftovers can therefore move to another job
   * without inventing a second purchase: the quantity walks, the purchase stays
   * where the money was spent.
   *
   *   used     installed at from_project_id
   *   moved    from_project_id → to_project_id
   *   returned went back to the vendor
   */
  movements: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      expense_id: 'VARCHAR(40) NOT NULL',
      type: "VARCHAR(20) NOT NULL DEFAULT 'used'",
      qty: 'DECIMAL(14,3) NOT NULL DEFAULT 0',
      from_project_id: 'VARCHAR(40) NULL',
      to_project_id: 'VARCHAR(40) NULL',
      date: 'DATE NULL',
      note: 'TEXT NULL',
      // Who recorded it. The point of the log, for anyone asking later.
      user_id: 'VARCHAR(40) NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: [
      'KEY idx_movements_expense (expense_id)',
      'KEY idx_movements_from (from_project_id, date)',
      'KEY idx_movements_to (to_project_id)',
      'KEY idx_movements_live (deleted_at)',
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

  /**
   * What the business costs to run, regardless of which jobs are on.
   *
   * Its own table, not `expenses` with an empty project_id. Every project
   * figure in the app filters on project_id, and one missed filter would put
   * office rent inside a client's job cost — the exact failure the separate
   * `transfers` table was created to prevent. A table that project queries
   * never name cannot leak into them.
   *
   * The test for what belongs here: if you would still pay it with no jobs
   * running, it is a company cost.
   */
  company_expenses: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      date: 'DATE NULL',
      category_id: 'VARCHAR(40) NULL',
      // NULL means company-wide rather than any one office.
      office_id: 'VARCHAR(40) NULL',
      account_id: 'VARCHAR(40) NULL',
      vendor: "VARCHAR(190) NOT NULL DEFAULT ''",
      description: 'TEXT NULL',
      amount: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      bill_no: "VARCHAR(80) NOT NULL DEFAULT ''",
      // Which commitment this bill settles, when it settles one. Gives an EMI
      // an audit trail and makes "what is left to repay" a sum rather than a
      // number somebody maintains by hand.
      commitment_id: 'VARCHAR(40) NULL',
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: [
      'KEY idx_company_expenses_date (date)',
      'KEY idx_company_expenses_commitment (commitment_id)',
      'KEY idx_company_expenses_category (category_id)',
      'KEY idx_company_expenses_office (office_id, date)',
      'KEY idx_company_expenses_account (account_id)',
      'KEY idx_company_expenses_live (deleted_at)',
    ],
  },

  /**
   * Money expected to move on a date — the only table in the app about the
   * future rather than the past.
   *
   * One shape covers all of it, because an EMI, the rent, the wifi bill and a
   * friend who owes you money are the same sentence: "₹X, from or to someone,
   * on this date, and then again next month." Four tables would be four sets of
   * date arithmetic to get wrong.
   *
   * A commitment records nothing about money that has actually moved. Settling
   * one writes a real company expense (or, for money coming back, whatever the
   * movement really was) and stamps last_settled_on here. The ledger stays the
   * single record of what happened; this only says what is coming.
   */
  commitments: {
    columns: {
      id: 'VARCHAR(40) NOT NULL',
      // 'payable' (you owe it) or 'receivable' (you are owed it).
      kind: "VARCHAR(20) NOT NULL DEFAULT 'payable'",
      name: 'VARCHAR(190) NOT NULL',
      party: "VARCHAR(190) NOT NULL DEFAULT ''",
      // 0 when the amount varies each time, like an electricity bill.
      amount: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      category_id: 'VARCHAR(40) NULL',
      office_id: 'VARCHAR(40) NULL',
      account_id: 'VARCHAR(40) NULL',
      // 0 = one-off, due on start_date. 1 = monthly, 3 = quarterly, 12 = yearly.
      every_months: 'INT NOT NULL DEFAULT 1',
      day_of_month: 'INT NOT NULL DEFAULT 1',
      start_date: 'DATE NULL',
      // An EMI's last instalment. NULL means it runs until switched off.
      end_date: 'DATE NULL',
      // What was borrowed or lent in the first place, so what is left to repay
      // can be shown. 0 for an ordinary recurring bill.
      total_amount: 'DECIMAL(14,2) NOT NULL DEFAULT 0',
      // How many days ahead to start warning.
      remind_days: 'INT NOT NULL DEFAULT 3',
      last_settled_on: 'DATE NULL',
      active: 'TINYINT(1) NOT NULL DEFAULT 1',
      note: 'TEXT NULL',
      updated_at: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      deleted_at: 'DATETIME NULL',
    },
    primary: '(id)',
    keys: [
      'KEY idx_commitments_active (active, deleted_at)',
      'KEY idx_commitments_kind (kind)',
      'KEY idx_commitments_live (deleted_at)',
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

// id, name, unit, tracks_inventory, kind
const SEED_CATEGORIES = [
  ['cat_sheet', 'Sheet', 'sheet', 1, 'project'],
  ['cat_fare', 'Fare', 'trip', 0, 'project'],
  ['cat_hardware', 'Hardware', 'pcs', 1, 'project'],
  ['cat_labour', 'Labour', 'day', 0, 'project'],
  ['cat_designer', 'Designer', 'job', 0, 'project'],
  ['cat_electric', 'Electric', 'pcs', 1, 'project'],
  ['cat_extra', 'Extra', 'item', 0, 'project'],

  // What the business costs to run. Nothing here tracks inventory — none of it
  // is material that can be left over.
  ['cat_co_rent', 'Rent', '', 0, 'company'],
  ['cat_co_electricity', 'Electricity', '', 0, 'company'],
  ['cat_co_internet', 'Internet & phone', '', 0, 'company'],
  ['cat_co_marketing', 'Marketing & ads', '', 0, 'company'],
  ['cat_co_software', 'Software & tools', '', 0, 'company'],
  ['cat_co_travel', 'Travel & fuel', '', 0, 'company'],
  ['cat_co_supplies', 'Office supplies', '', 0, 'company'],
  ['cat_co_repairs', 'Repairs & upkeep', '', 0, 'company'],
  ['cat_co_fees', 'Professional fees', '', 0, 'company'],
  ['cat_co_bank', 'Bank charges', '', 0, 'company'],
  ['cat_co_salary', 'Salary & wages', '', 0, 'company'],
  ['cat_co_other', 'Other', '', 0, 'company'],
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
    const backfilled = await backfillMovements(conn)
    const adminCreated = await ensureAdmin(conn)

    await conn.execute(
      "INSERT INTO app_meta (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
      [String(SCHEMA_VERSION)],
    )

    ensured = true
    return { ran: true, added, adminCreated, backfilled }
  } finally {
    conn.release()
  }
}

/**
 * Turns the old single "used on site" number into the movement log.
 *
 * Every purchase line that already records material used gets one opening
 * movement carrying that quantity, so nothing recorded before the log existed
 * is lost. Only lines with no movements at all are touched, which makes this
 * safe to run on every boot: once a line has a history, it is never rewritten.
 */
async function backfillMovements(conn) {
  const [rows] = await conn.query(
    `SELECT e.id, e.project_id, e.used_qty, e.date
       FROM expenses e
       LEFT JOIN movements m ON m.expense_id = e.id
      WHERE e.deleted_at IS NULL AND e.used_qty > 0 AND m.id IS NULL`,
  )

  for (const row of rows) {
    await conn.execute(
      `INSERT INTO movements (id, expense_id, type, qty, from_project_id, date, note)
       VALUES (?, ?, 'used', ?, ?, ?, ?)`,
      [
        'mov_' + row.id.replace(/^exp_/, '') + '_opening',
        row.id,
        row.used_qty,
        row.project_id,
        row.date,
        'Recorded before deployments were tracked separately',
      ],
    )
  }

  if (rows.length) console.log(`[kalope] carried ${rows.length} used-on-site figure(s) into the movement log`)
  return rows.length
}

/** INSERT IGNORE, so a firm that renamed or deleted a head keeps its changes. */
async function seedMasters(conn) {
  for (const row of SEED_ACCOUNTS) {
    await conn.execute('INSERT IGNORE INTO accounts (id, name, kind, holder) VALUES (?, ?, ?, ?)', row)
  }
  for (const row of SEED_CATEGORIES) {
    await conn.execute(
      'INSERT IGNORE INTO categories (id, name, unit, tracks_inventory, kind) VALUES (?, ?, ?, ?, ?)',
      row,
    )
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
