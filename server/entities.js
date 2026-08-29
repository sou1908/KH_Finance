/**
 * The browser speaks camelCase, MySQL speaks snake_case. This is the only place
 * that knows the difference, so adding a column means one line here and one
 * line in schema.js.
 */

/**
 * The table an entity lives in.
 *
 * Every entity used to be one lowercase word, so the key doubled as the table
 * name and the queries interpolated it directly. `companyExpenses` broke that,
 * and the two ways out were a hand-written lookup — a third list to keep in
 * step — or deriving it. Derived wins: a future entity needs no entry anywhere.
 */
export const tableOf = (entity) => entity.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

export const ENTITIES = {
  clients: {
    id: 'id',
    name: 'name',
    phone: 'phone',
    note: 'note',
  },
  accounts: {
    id: 'id',
    name: 'name',
    kind: 'kind',
    holder: 'holder',
    openingBalance: 'opening_balance',
  },
  categories: {
    id: 'id',
    name: 'name',
    unit: 'unit',
    tracksInventory: 'tracks_inventory',
    // 'project' (Sheet, Labour) or 'company' (Rent, Electricity). The same
    // list serves both sides; this is what keeps office rent out of the head
    // dropdown on a client's bill.
    kind: 'kind',
  },
  /** Where a company cost was incurred. Absent means company-wide. */
  offices: {
    id: 'id',
    name: 'name',
    address: 'address',
    note: 'note',
  },
  projects: {
    id: 'id',
    name: 'name',
    clientId: 'client_id',
    phone: 'phone',
    site: 'site',
    quotedAmount: 'quoted_amount',
    startDate: 'start_date',
    status: 'status',
    note: 'note',
  },
  receipts: {
    id: 'id',
    projectId: 'project_id',
    date: 'date',
    amount: 'amount',
    accountId: 'account_id',
    mode: 'mode',
    reference: 'reference',
    note: 'note',
  },
  vendors: {
    id: 'id',
    name: 'name',
    phone: 'phone',
    note: 'note',
  },
  items: {
    id: 'id',
    categoryId: 'category_id',
    name: 'name',
    unit: 'unit',
    rate: 'rate',
    note: 'note',
  },
  movements: {
    id: 'id',
    expenseId: 'expense_id',
    type: 'type',
    qty: 'qty',
    fromProjectId: 'from_project_id',
    toProjectId: 'to_project_id',
    date: 'date',
    note: 'note',
    userId: 'user_id',
  },
  transfers: {
    id: 'id',
    date: 'date',
    amount: 'amount',
    fromAccountId: 'from_account_id',
    toAccountId: 'to_account_id',
    projectId: 'project_id',
    mode: 'mode',
    reference: 'reference',
    note: 'note',
  },
  expenses: {
    id: 'id',
    projectId: 'project_id',
    date: 'date',
    categoryId: 'category_id',
    accountId: 'account_id',
    vendor: 'vendor',
    description: 'description',
    qty: 'qty',
    unit: 'unit',
    rate: 'rate',
    amount: 'amount',
    billNo: 'bill_no',
    usedQty: 'used_qty',
  },
  /**
   * What the business costs to run: rent, power, internet, marketing.
   *
   * Its own table for the same reason transfers are: a company cost must never
   * be able to land inside a client's job. Separate tables make that structural
   * rather than something every query has to remember to exclude.
   */
  companyExpenses: {
    id: 'id',
    date: 'date',
    categoryId: 'category_id',
    officeId: 'office_id',
    accountId: 'account_id',
    vendor: 'vendor',
    description: 'description',
    amount: 'amount',
    billNo: 'bill_no',
    note: 'note',
  },
}

/** Entities whose rows can carry attachments. */
export const ATTACHABLE = ['projects', 'receipts', 'expenses', 'transfers', 'companyExpenses']

// DECIMAL arrives as a string so precision is never lost in transit; the
// browser wants numbers, and these are the fields to convert.
const NUMERIC = new Set(['amount', 'rate', 'qty', 'usedQty', 'quotedAmount', 'openingBalance'])
const BOOLEAN = new Set(['tracksInventory'])
const NULLABLE_DATE = new Set(['startDate', 'date'])
// projectId is deliberately absent: on receipts and expenses the column is NOT
// NULL, so turning an empty string into NULL there would fail the insert.
const NULLABLE_REF = new Set([
  'clientId', 'accountId', 'categoryId', 'officeId',
  'fromAccountId', 'toAccountId',
  'fromProjectId', 'toProjectId', 'userId',
])

export function rowToJson(row, fields) {
  const out = {}
  for (const [jsKey, column] of Object.entries(fields)) {
    const value = row[column]
    if (NUMERIC.has(jsKey)) out[jsKey] = value === null || value === undefined ? 0 : Number(value)
    else if (BOOLEAN.has(jsKey)) out[jsKey] = Boolean(Number(value))
    else out[jsKey] = value === null || value === undefined ? '' : String(value)
  }
  return out
}

export function normalise(jsKey, value) {
  if (NUMERIC.has(jsKey)) return Number.isFinite(Number(value)) ? Number(value) : 0
  if (BOOLEAN.has(jsKey)) return value ? 1 : 0
  // An empty date string is NULL, not '0000-00-00', which strict MySQL rejects.
  if (NULLABLE_DATE.has(jsKey) && !String(value ?? '')) return null
  if (NULLABLE_REF.has(jsKey) && !String(value ?? '')) return null
  if (value === null || value === undefined) return null
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
