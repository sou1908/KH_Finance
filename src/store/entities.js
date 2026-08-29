/**
 * The shape of the ledger, with no React in it.
 *
 * Split out of AppStore so a plain Node test can import it: the rule about
 * which rows survive "erase everything" is exactly the kind of thing that
 * should be asserted, and a .jsx file cannot be imported to assert it.
 */

export const EMPTY = {
  accounts: [],
  categories: [],
  clients: [],
  // Shops and contractors you buy from, so the name is picked rather than
  // retyped — and spelled the same way every time.
  vendors: [],
  // The things you buy, each belonging to one head, with the unit and the last
  // rate you paid.
  items: [],
  // Where a company cost was incurred. No office means company-wide.
  offices: [],
  projects: [],
  receipts: [],
  expenses: [],
  // What the business costs to run, whatever jobs are on: rent, power,
  // internet, marketing. Never attached to a project, so it can never land
  // inside a client's job cost.
  companyExpenses: [],
  // Money expected to move on a date — EMIs, rent, whoever owes you. The only
  // list in the app about the future rather than what already happened.
  commitments: [],
  // Money moved between our own accounts. Never income, never spending.
  transfers: [],
  // What happened to material after it was bought: used at site, moved to
  // another job, or returned. Quantities only — never money.
  movements: [],
}

/**
 * Every entity, in the order a backup should carry them.
 *
 * Declared beside EMPTY so adding one is a single edit. Listing entities by
 * hand in each place that walks them is how `transfers` went missing from
 * every backup taken between it shipping and this being noticed.
 */
export const ENTITIES = Object.keys(EMPTY)

/**
 * The ledger: a record of what actually happened. This is what "erase
 * everything" clears, and nothing else.
 */
export const LEDGER = ['projects', 'receipts', 'expenses', 'movements', 'transfers', 'companyExpenses']

/**
 * Setup: the chart of accounts, the heads, the lists of who you deal with.
 *
 * Erasing used to take these too, which the confirmation never said it would —
 * and since local mode only seeds defaults when there is no saved data at all,
 * they never came back. The app was left with no account to file a bill
 * against and no head to file it under.
 */
export const MASTERS = ENTITIES.filter((entity) => !LEDGER.includes(entity))

/** The rows that can hold an attached file. Mirrors ATTACHABLE on the server. */
export const WITH_FILES = ['projects', 'receipts', 'expenses', 'transfers', 'companyExpenses']

/** Roles, mirroring server/roles.js. The server is what enforces them. */
export const ROLES = { OWNER: 'owner', PROCUREMENT: 'procurement' }
