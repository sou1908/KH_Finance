/**
 * The browser speaks camelCase, MySQL speaks snake_case. This is the only place
 * that knows the difference, so adding a column means one line here and one
 * line in schema.js.
 */
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
}

/** Entities whose rows can carry attachments. */
export const ATTACHABLE = ['projects', 'receipts', 'expenses']

// DECIMAL arrives as a string so precision is never lost in transit; the
// browser wants numbers, and these are the fields to convert.
const NUMERIC = new Set(['amount', 'rate', 'qty', 'usedQty', 'quotedAmount', 'openingBalance'])
const BOOLEAN = new Set(['tracksInventory'])
const NULLABLE_DATE = new Set(['startDate', 'date'])
const NULLABLE_REF = new Set(['clientId', 'accountId', 'categoryId'])

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
