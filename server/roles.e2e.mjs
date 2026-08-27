// Does the server actually withhold money from a procurement account?
// Role enforcement, against a THROWAWAY database — it creates logins and writes.
// Run the server first, then:  npm run test:roles
const BASE = process.env.KALOPE_TEST_URL ?? 'http://127.0.0.1:3820/api'
let pass = 0, fail = 0
const check = (l, ok, d = '') => { ok ? (pass++, console.log(`  PASS  ${l}`)) : (fail++, console.log(`  FAIL  ${l}${d ? ' â€” ' + d : ''}`)) }

const call = async (p, { method = 'GET', body, token } = {}) => {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => null) }
}
const login = async (email, password) => (await call('/auth/login', { method: 'POST', body: { email, password } })).data?.token

let r = await call('/health')
check('schema migrated to v6', r.data?.schemaVersion === 6, String(r.data?.schemaVersion))

const owner = await login('owner@kalope.test', 'CorrectHorse123')
check('owner signed in', Boolean(owner))

console.log('\n=== owner creates a procurement login ===')
r = await call('/users', { method: 'POST', token: owner, body: { email: 'proc@kalope.test', password: 'SiteWork12345', name: 'Ramesh', role: 'procurement' } })
check('procurement account created', r.status === 200 && r.data?.user?.role === 'procurement', JSON.stringify(r.data))

r = await call('/users', { token: owner })
check('owner can list logins', r.status === 200 && r.data?.users?.length === 2, JSON.stringify(r.data?.users?.length))
check('no password hashes are sent', !JSON.stringify(r.data).includes('scrypt'))

// Seed a purchase as the owner.
r = await call('/sync', { method: 'POST', token: owner, body: { ops: [
  { id: 'a', type: 'add', entity: 'projects', payload: { id: 'prj_r', name: 'Roles Test', clientId: '', phone: '', site: 'Thane', quotedAmount: 1450000, startDate: '2026-04-01', status: 'Active', note: '', attachments: [] } },
  { id: 'b', type: 'add', entity: 'receipts', payload: { id: 'rec_r', projectId: 'prj_r', date: '2026-04-02', amount: 400000, accountId: 'acc_company', mode: 'NEFT', reference: '', note: '', attachments: [] } },
  { id: 'c', type: 'add', entity: 'expenses', payload: { id: 'exp_r', projectId: 'prj_r', date: '2026-04-03', categoryId: 'cat_sheet', accountId: 'acc_cash', vendor: 'Shree Ply Mart', description: '19mm BWP plywood', qty: 50, unit: 'sheet', rate: 3150, amount: 157500, billNo: 'SP/1', usedQty: 0, attachments: [] } },
  { id: 'd', type: 'add', entity: 'transfers', payload: { id: 'trf_r', date: '2026-04-02', amount: 50000, fromAccountId: 'acc_company', toAccountId: 'acc_cash', projectId: 'prj_r', mode: 'IMPS', reference: '', note: '', attachments: [] } },
] } })
check('owner seeded the ledger', r.status === 200, JSON.stringify(r.data))

const proc = await login('proc@kalope.test', 'SiteWork12345')
check('procurement signed in', Boolean(proc))

console.log('\n=== what procurement actually receives from /state ===')
r = await call('/state', { token: proc })
const s = r.data
const raw = JSON.stringify(s)

console.log('  entities sent:', Object.keys(s).join(', '))
check('receipts never sent', !('receipts' in s))
check('transfers never sent', !('transfers' in s))
check('accounts never sent', !('accounts' in s))
check('projects sent', Array.isArray(s.projects) && s.projects.length === 1)
check('purchase lines sent', Array.isArray(s.expenses) && s.expenses.length === 1)

const exp = s.expenses[0]
console.log('  a purchase line looks like:', JSON.stringify(exp))
check('quantity is there', exp.qty === 50)
check('vendor is there', exp.vendor === 'Shree Ply Mart')
check('rate is NOT there', !('rate' in exp))
check('amount is NOT there', !('amount' in exp))
check('project quote is NOT there', !('quotedAmount' in s.projects[0]))

// The blunt test: is any money figure anywhere in the payload?
check('no figure from the ledger appears anywhere in the response',
  !raw.includes('157500') && !raw.includes('3150') && !raw.includes('400000') && !raw.includes('1450000'),
  'a money value leaked into the payload')

console.log('\n=== what procurement is allowed to write ===')
r = await call('/sync', { method: 'POST', token: proc, body: { ops: [
  { id: 'm1', type: 'add', entity: 'movements', payload: { id: 'mov_1', expenseId: 'exp_r', type: 'used', qty: 30, fromProjectId: 'prj_r', toProjectId: '', date: '2026-04-10', note: '30 sheets to site' } },
] } })
check('can record a deployment', r.status === 200, JSON.stringify(r.data))

r = await call('/sync', { method: 'POST', token: proc, body: { ops: [
  { id: 'x', type: 'update', entity: 'expenses', payload: { id: 'exp_r', rate: 1 } },
] } })
check('cannot change a bill', r.status === 403, `${r.status} ${JSON.stringify(r.data)}`)

r = await call('/sync', { method: 'POST', token: proc, body: { ops: [
  { id: 'y', type: 'add', entity: 'receipts', payload: { id: 'rec_x', projectId: 'prj_r', amount: 999 } },
] } })
check('cannot invent a receipt', r.status === 403)

r = await call('/sync', { method: 'POST', token: proc, body: { ops: [
  { id: 'z', type: 'replaceAll', entity: 'all', payload: {} },
] } })
check('cannot wipe the ledger', r.status === 403)

r = await call('/sync', { method: 'POST', token: proc, body: { ops: [
  { id: 'ok', type: 'add', entity: 'movements', payload: { id: 'mov_2', expenseId: 'exp_r', type: 'used', qty: 1, fromProjectId: 'prj_r', date: '2026-04-11' } },
  { id: 'bad', type: 'update', entity: 'projects', payload: { id: 'prj_r', quotedAmount: 0 } },
] } })
check('a mixed batch is refused whole', r.status === 403)
r = await call('/state', { token: proc })
check('and the allowed half was not written', !r.data.movements?.some((m) => m.id === 'mov_2'))

r = await call('/users', { token: proc })
check('cannot list logins', r.status === 403, String(r.status))
r = await call('/users', { method: 'POST', token: proc, body: { email: 'x@y.com', password: 'password123', role: 'owner' } })
check('cannot create an owner for themselves', r.status === 403)

console.log('\n=== the movement reached the ledger, and the owner sees it ===')
r = await call('/state', { token: owner })
const mov = r.data.movements?.find((m) => m.id === 'mov_1')
check('deployment recorded', mov?.qty === 30, JSON.stringify(mov))
check('stamped with who recorded it', Boolean(mov?.userId), mov?.userId)
check("owner's money is untouched", r.data.expenses[0].amount === 157500)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
