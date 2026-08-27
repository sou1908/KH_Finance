/**
 * Money arithmetic when material moves between jobs.
 *
 * Needs no database and no server — these are pure functions over a state
 * object, so this suite runs anywhere:
 *
 *   npm run test:selectors
 *
 * The invariant it guards: a bill is never rewritten, yet the cost of material
 * follows the material. Billed and consumed must therefore agree in total
 * across every project, no matter how much moves between them.
 */
import { projectTotals, inventoryLeft } from './selectors.js'

let pass = 0, fail = 0
const check = (l, ok, d = '') => { ok ? (pass++, console.log(`  PASS  ${l}`)) : (fail++, console.log(`  FAIL  ${l}${d ? ' — ' + d : ''}`)) }

// Kothari buys 50 sheets at 3,150. Vaidya buys nothing. 20 sheets move across.
const state = {
  categories: [{ id: 'cat_sheet', name: 'Sheet', unit: 'sheet', tracksInventory: true }],
  projects: [
    { id: 'kothari', name: 'Kothari', quotedAmount: 1450000 },
    { id: 'vaidya', name: 'Vaidya', quotedAmount: 880000 },
  ],
  receipts: [
    { id: 'r1', projectId: 'kothari', amount: 700000 },
    { id: 'r2', projectId: 'vaidya', amount: 400000 },
  ],
  expenses: [
    { id: 'e1', projectId: 'kothari', categoryId: 'cat_sheet', description: '19mm ply', qty: 50, unit: 'sheet', rate: 3150, amount: 157500, usedQty: 0 },
    { id: 'e2', projectId: 'vaidya', categoryId: 'cat_sheet', description: '12mm ply', qty: 10, unit: 'sheet', rate: 2000, amount: 20000, usedQty: 0 },
  ],
  movements: [
    { id: 'm1', expenseId: 'e1', type: 'used', qty: 30, fromProjectId: 'kothari', toProjectId: '', date: '2026-04-10' },
    { id: 'm2', expenseId: 'e1', type: 'moved', qty: 20, fromProjectId: 'kothari', toProjectId: 'vaidya', date: '2026-04-12' },
  ],
  accounts: [], clients: [], vendors: [], items: [], transfers: [],
}

const k = projectTotals(state, 'kothari')
const v = projectTotals(state, 'vaidya')

console.log('=== Kothari: bought the material, lent 20 sheets away ===')
console.log(`  billed ${k.expenditure} · out ${k.materialOut} · consumed ${k.netCost} · margin ${k.margin}`)
check('the bill is untouched at 157,500', k.expenditure === 157500, String(k.expenditure))
check('20 sheets @ 3,150 valued at 63,000 out', k.materialOut === 63000, String(k.materialOut))
check('consumed 94,500, being the 30 sheets it used', k.netCost === 94500, String(k.netCost))
check('margin uses what it consumed (1,450,000 − 94,500)', k.margin === 1355500, String(k.margin))

console.log('\n=== Vaidya: received 20 sheets it never paid for ===')
console.log(`  billed ${v.expenditure} · in ${v.materialIn} · consumed ${v.netCost} · margin ${v.margin}`)
check('its own bill is untouched at 20,000', v.expenditure === 20000, String(v.expenditure))
check('63,000 of material received', v.materialIn === 63000, String(v.materialIn))
check('consumed 83,000', v.netCost === 83000, String(v.netCost))
check('margin charges it for what it got (880,000 − 83,000)', v.margin === 797000, String(v.margin))

console.log('\n=== the two sides must reconcile ===')
const billedTotal = k.expenditure + v.expenditure
const consumedTotal = k.netCost + v.netCost
console.log(`  billed across both ${billedTotal} · consumed across both ${consumedTotal}`)
check('nothing is created or destroyed by the move', billedTotal === consumedTotal, `${billedTotal} vs ${consumedTotal}`)
check('what left one job equals what reached the other', k.materialOut === v.materialIn)

const all = projectTotals(state, 'all')
check('firm-wide spend is unchanged by internal moves', all.expenditure === 177500 && all.netCost === 177500, `${all.expenditure}/${all.netCost}`)
check('firm-wide shows no transfer adjustment', all.hasTransfers === false)

console.log('\n=== "Remaining" still answers the cash question, not the cost one ===')
check('Kothari remaining is receipts minus what was billed', k.remaining === 700000 - 157500, String(k.remaining))

console.log('\n=== and the sheets are physically where they should be ===')
const kStock = inventoryLeft(state, 'kothari').lines.find((l) => l.id === 'e1')
const vStock = inventoryLeft(state, 'vaidya').lines.find((l) => l.id === 'e1')
console.log(`  Kothari holds ${kStock?.left ?? 0} · Vaidya holds ${vStock?.left ?? 0}`)
check('Kothari holds none of that line', (kStock?.left ?? 0) === 0, String(kStock?.left))
check('Vaidya holds the 20 that moved', (vStock?.left ?? 0) === 20, String(vStock?.left))
check('and it is valued at what was paid', (vStock?.value ?? 0) === 63000, String(vStock?.value))

console.log('\n=== a scoped stock list carries lines another job paid for ===')
// This is why Inventory has to filter before totalling "Material bought":
// Kothari's purchase line appears under Vaidya because its material stands there.
const vLines = inventoryLeft(state, 'vaidya').lines
check('Vaidya sees Kothari\'s purchase line', vLines.some((l) => l.projectId === 'kothari'), JSON.stringify(vLines.map((l) => l.projectId)))
const vBoughtNaive = vLines.reduce((t, l) => t + l.qty * l.rate, 0)
const vBoughtOwn = vLines.filter((l) => l.projectId === 'vaidya').reduce((t, l) => t + l.qty * l.rate, 0)
check('totalling all lines would overstate Vaidya\'s spend', vBoughtNaive === 177500, String(vBoughtNaive))
check('counting only its own lines gives the real 20,000', vBoughtOwn === 20000, String(vBoughtOwn))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
