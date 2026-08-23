/**
 * Integration test for the API.
 *
 * Needs a running server pointed at a THROWAWAY database — it writes, deletes
 * and deliberately rolls back. Never point it at real data.
 *
 *   npm run build && npm start          # in one terminal, env vars set
 *   npm run test:e2e                    # in another
 *
 * Override with KALOPE_TEST_URL / KALOPE_TEST_EMAIL / KALOPE_TEST_PASSWORD.
 */

const BASE = process.env.KALOPE_TEST_URL ?? 'http://127.0.0.1:3111/api'
const EMAIL = process.env.KALOPE_TEST_EMAIL ?? 'owner@kalope.test'
const PASSWORD = process.env.KALOPE_TEST_PASSWORD ?? 'CorrectHorse123'

let token = null
let pass = 0
let fail = 0

const call = async (path, { method = 'GET', body, form, raw } = {}) => {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  })
  return { status: res.status, data: raw ? await res.arrayBuffer() : await res.json().catch(() => null) }
}

const check = (label, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  PASS  ${label}`)
  } else {
    fail++
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`)
  }
}

console.log('\n=== schema creation + admin bootstrap ===')
let r = await call('/health')
check('health ok', r.data?.ok === true, JSON.stringify(r.data))
check(`server is ${r.data?.server}`, Boolean(r.data?.server))
check('schema present', r.data?.schemaVersion >= 3)
check('a login exists', r.data?.rows?.users >= 1, `users=${r.data?.rows?.users}`)
check('uploads writable', r.data?.uploads?.writable === true)
check('uploads outside app folder', r.data?.uploads?.insideAppFolder === false)

console.log('\n=== auth ===')
r = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: 'wrong-password' } })
check('wrong password rejected', r.status === 401)
r = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
check('correct password accepted', r.status === 200 && Boolean(r.data?.token), JSON.stringify(r.data))
token = r.data?.token
r = await call('/auth/me')
check('session resolves to the user', r.data?.user?.email === EMAIL)

console.log('\n=== state + seeded masters ===')
r = await call('/state')
check('state loads', r.status === 200)
check('4 accounts seeded', r.data?.accounts?.length >= 4, `got ${r.data?.accounts?.length}`)
check('7 heads seeded', r.data?.categories?.length >= 7, `got ${r.data?.categories?.length}`)
check('openingBalance is a number, not a string', typeof r.data?.accounts?.[0]?.openingBalance === 'number')
check('tracksInventory is a boolean', typeof r.data?.categories?.[0]?.tracksInventory === 'boolean')

console.log('\n=== sync: the outbox path ===')
const ops = [
  {
    id: 'op1',
    type: 'add',
    entity: 'clients',
    payload: { id: 'cli_t1', name: "O'Brien & Sons", phone: '98200 11223', note: 'quote test' },
  },
  {
    id: 'op2',
    type: 'add',
    entity: 'projects',
    payload: {
      id: 'prj_t1',
      name: 'E2E Villa',
      clientId: 'cli_t1',
      phone: '',
      site: 'Thane',
      quotedAmount: 1450000,
      startDate: '2026-04-08',
      status: 'Active',
      note: '',
      attachments: [],
    },
  },
  {
    id: 'op3',
    type: 'add',
    entity: 'receipts',
    payload: {
      id: 'rec_t1',
      projectId: 'prj_t1',
      date: '2026-04-10',
      amount: 400000.55,
      accountId: 'acc_company',
      mode: 'NEFT',
      reference: 'HDFC/1',
      note: 'advance',
      attachments: [],
    },
  },
  {
    id: 'op4',
    type: 'add',
    entity: 'expenses',
    payload: {
      id: 'exp_t1',
      projectId: 'prj_t1',
      date: '2026-04-12',
      categoryId: 'cat_sheet',
      accountId: 'acc_cash',
      vendor: 'Shree Ply',
      description: '19mm ply',
      qty: 42,
      unit: 'sheet',
      rate: 3150,
      amount: 132300,
      billNo: 'S/1',
      usedQty: 36,
      attachments: [],
    },
  },
]
r = await call('/sync', { method: 'POST', body: { ops } })
check('batch applied', r.status === 200 && r.data?.count === 4, JSON.stringify(r.data))

r = await call('/state')
const prj = r.data?.projects?.find((p) => p.id === 'prj_t1')
const rec = r.data?.receipts?.find((x) => x.id === 'rec_t1')
check('project round-tripped', prj?.name === 'E2E Villa')
check('quote survives as a number', prj?.quotedAmount === 1450000, String(prj?.quotedAmount))
check('DECIMAL paise preserved', rec?.amount === 400000.55, String(rec?.amount))
check(
  'apostrophe in a name stored safely',
  r.data?.clients?.some((c) => c.name === "O'Brien & Sons"),
)
check('date is a plain YYYY-MM-DD', rec?.date === '2026-04-10', rec?.date)

console.log('\n=== idempotency: replaying a batch must not duplicate ===')
await call('/sync', { method: 'POST', body: { ops } })
r = await call('/state')
check('replay created no duplicates', r.data?.projects?.filter((p) => p.id === 'prj_t1').length === 1)

console.log('\n=== a bad op rolls the whole batch back ===')
r = await call('/sync', {
  method: 'POST',
  body: {
    ops: [
      { id: 'ok', type: 'add', entity: 'clients', payload: { id: 'cli_rollback', name: 'Should Vanish' } },
      { id: 'bad', type: 'add', entity: 'not_a_table', payload: { id: 'x' } },
    ],
  },
})
check('bad batch rejected with 422', r.status === 422, String(r.status))
r = await call('/state')
check('the good op in that batch rolled back', !r.data?.clients?.some((c) => c.id === 'cli_rollback'))

console.log('\n=== file upload ===')
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
)
const fd = new FormData()
fd.append('file', new Blob([png], { type: 'image/png' }), 'bill.png')
fd.append('id', 'att_t1')
fd.append('ownerType', 'expenses')
fd.append('ownerId', 'exp_t1')
r = await call('/files', { method: 'POST', form: fd })
check('upload accepted', r.status === 200 && r.data?.id === 'att_t1', JSON.stringify(r.data))
check('type sniffed from content', r.data?.type === 'image/png', r.data?.type)

const bad = new FormData()
bad.append('file', new Blob([Buffer.from('#!/bin/sh\nrm -rf /')], { type: 'image/png' }), 'evil.png')
r = await call('/files', { method: 'POST', form: bad })
check('a script disguised as a PNG is rejected', r.status === 415, String(r.status))

await call('/sync', {
  method: 'POST',
  body: {
    ops: [
      {
        id: 'op5',
        type: 'update',
        entity: 'expenses',
        payload: { id: 'exp_t1', attachments: [{ id: 'att_t1', name: 'bill.png', type: 'image/png', size: png.length }] },
      },
    ],
  },
})
r = await call('/state')
check('attachment linked to its expense', r.data?.expenses?.find((e) => e.id === 'exp_t1')?.attachments?.length === 1)

r = await call('/files/att_t1', { raw: true })
check('file downloads with the same bytes', r.status === 200 && r.data.byteLength === png.length)

console.log('\n=== soft delete ===')
await call('/sync', {
  method: 'POST',
  body: { ops: [{ id: 'op6', type: 'remove', entity: 'receipts', payload: { id: 'rec_t1' } }] },
})
r = await call('/state')
check('deleted receipt gone from state', !r.data?.receipts?.some((x) => x.id === 'rec_t1'))

console.log('\n=== auth is enforced ===')
const saved = token
token = null
r = await call('/state')
check('no token = 401', r.status === 401)
token = 'deadbeef'
r = await call('/state')
check('bad token = 401', r.status === 401)
token = saved

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
