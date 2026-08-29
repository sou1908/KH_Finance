/**
 * The company side, and the one number both halves feed.
 *
 * Needs no database and no server:
 *
 *   npm run test:company
 *
 * Three invariants it guards:
 *
 *   1. A company cost can never reach a project figure. Office rent must not
 *      move a single number on any job, however it is filed.
 *   2. Every month's movement accumulates onto money in hand. Add up the
 *      movements and you land exactly on the balance — that is what makes a
 *      wildly swinging monthly figure safe to show.
 *   3. None of it is ever sent to a procurement browser. The server rule is a
 *      pure function, so it is checked here rather than only over HTTP.
 */
import {
  accountLedger,
  categoryBreakdown,
  combinedLedger,
  companyTotals,
  headsOfKind,
  inPeriod,
  moneyInHand,
  moneyMovement,
  periodRange,
  projectTotals,
} from './selectors.js'
import { filterStateFor } from '../../server/roles.js'

let pass = 0, fail = 0
const check = (l, ok, d = '') => { ok ? (pass++, console.log(`  PASS  ${l}`)) : (fail++, console.log(`  FAIL  ${l}${d ? ' — ' + d : ''}`)) }

const base = {
  categories: [
    { id: 'cat_sheet', name: 'Sheet', unit: 'sheet', tracksInventory: true, kind: 'project' },
    { id: 'cat_labour', name: 'Labour', unit: 'day', tracksInventory: false, kind: 'project' },
    { id: 'cat_rent', name: 'Rent', unit: '', tracksInventory: false, kind: 'company' },
    { id: 'cat_power', name: 'Electricity', unit: '', tracksInventory: false, kind: 'company' },
    { id: 'cat_ads', name: 'Marketing & ads', unit: '', tracksInventory: false, kind: 'company' },
  ],
  offices: [
    { id: 'off_main', name: 'Andheri office' },
    { id: 'off_site', name: 'Powai office' },
  ],
  accounts: [
    { id: 'acc_cash', name: 'Cash', kind: 'cash', openingBalance: 200000 },
    { id: 'acc_co', name: 'Company A/C', kind: 'company', openingBalance: 0 },
  ],
  projects: [{ id: 'kothari', name: 'Kothari', quotedAmount: 1450000 }],
  clients: [], vendors: [], items: [], movements: [], transfers: [],

  receipts: [
    { id: 'r1', projectId: 'kothari', accountId: 'acc_cash', date: '2026-04-05', amount: 700000 },
  ],
  expenses: [
    { id: 'e1', projectId: 'kothari', categoryId: 'cat_sheet', accountId: 'acc_cash', date: '2026-04-08', qty: 50, rate: 3150, amount: 157500, usedQty: 0 },
  ],
  companyExpenses: [
    { id: 'c1', categoryId: 'cat_rent', officeId: 'off_main', accountId: 'acc_cash', date: '2026-04-01', amount: 60000, vendor: 'Landlord' },
    { id: 'c2', categoryId: 'cat_power', officeId: 'off_main', accountId: 'acc_cash', date: '2026-04-12', amount: 9000, vendor: 'MSEB' },
    { id: 'c3', categoryId: 'cat_rent', officeId: 'off_site', accountId: 'acc_co', date: '2026-04-01', amount: 25000, vendor: 'Landlord' },
    // No office: a cost that belongs to the firm, not to either premises.
    { id: 'c4', categoryId: 'cat_ads', officeId: '', accountId: 'acc_co', date: '2026-05-03', amount: 40000, vendor: 'Agency' },
  ],
}

// The same firm with no company costs at all, to prove nothing on the project
// side moves when they are added.
const noCompany = { ...base, companyExpenses: [] }

console.log('=== a company cost can never reach a project figure ===')
const withCo = projectTotals(base, 'kothari')
const without = projectTotals(noCompany, 'kothari')
check('incoming is untouched', withCo.incoming === without.incoming, `${withCo.incoming} vs ${without.incoming}`)
check('expenditure is untouched', withCo.expenditure === without.expenditure, `${withCo.expenditure} vs ${without.expenditure}`)
check('remaining is untouched', withCo.remaining === without.remaining)
check('margin is untouched', withCo.margin === without.margin)
check('the job still shows only its own 157,500', withCo.expenditure === 157500, String(withCo.expenditure))

const allProjects = projectTotals(base, 'all')
check('even across all projects, rent stays out', allProjects.expenditure === 157500, String(allProjects.expenditure))

console.log('\n=== heads keep to their own side ===')
check('5 heads split 2 project / 3 company', headsOfKind(base, 'project').length === 2 && headsOfKind(base, 'company').length === 3)
const breakdown = categoryBreakdown(base, 'all')
check('the project breakdown never lists a company head', breakdown.every((c) => c.kind === 'project'), JSON.stringify(breakdown.map((c) => c.name)))
check('so "heads in use" counts 2, not 5', breakdown.length === 2, String(breakdown.length))

console.log('\n=== but the money really did leave the accounts ===')
const cash = accountLedger(base, 'all').find((a) => a.id === 'acc_cash')
const co = accountLedger(base, 'all').find((a) => a.id === 'acc_co')
console.log(`  cash: opening ${cash.opening} + in ${cash.inflow} − jobs ${cash.outflow} − company ${cash.companyOutflow} = ${cash.balance}`)
check('cash carries 69,000 of company spending', cash.companyOutflow === 69000, String(cash.companyOutflow))
check('cash balance is 200000+700000−157500−69000', cash.balance === 673500, String(cash.balance))
check('company A/C is 65,000 overdrawn, and says so', co.balance === -65000, String(co.balance))

const hand = moneyInHand(base)
check('money in hand is the two added up', hand.total === 673500 - 65000, String(hand.total))
check('and it names the account in the red', hand.negative.length === 1 && hand.negative[0].id === 'acc_co')

console.log('\n=== scoped to a job, company costs are simply not its money ===')
const scoped = accountLedger(base, 'kothari').find((a) => a.id === 'acc_cash')
check('no company outflow appears under a project', scoped.companyOutflow === 0, String(scoped.companyOutflow))
check('and no opening balance either', scoped.opening === 0)

console.log('\n=== the split an owner actually asks for ===')
const fy = periodRange('fy', new Date(2026, 5, 1)) // June 2026 → FY 2026-27
check('FY runs April to March', fy.from === '2026-04-01' && fy.to === '2027-03-31', `${fy.from}..${fy.to}`)
check('and is labelled the way the accountant does', fy.label === 'FY 2026–27', fy.label)

// January belongs to the financial year that began the previous April.
const janFy = periodRange('fy', new Date(2027, 0, 15))
check('January still sits in the year that began last April', janFy.from === '2026-04-01', janFy.from)

const totals = companyTotals(base, fy)
check('134,000 of company costs in the year', totals.total === 134000, String(totals.total))
check('rent is the biggest head at 85,000', totals.byHead[0].name === 'Rent' && totals.byHead[0].amount === 85000, JSON.stringify(totals.byHead[0]))
check('three offices-ish buckets, including company-wide', totals.byOffice.length === 3, String(totals.byOffice.length))
const wide = totals.byOffice.find((o) => o.name === 'Company-wide')
check('the ad campaign lands under company-wide, not an office', wide?.amount === 40000, JSON.stringify(wide))
check('shares add up to 1', Math.abs(totals.byHead.reduce((t, h) => t + h.share, 0) - 1) < 1e-9)

console.log('\n=== dates are read as the local calendar, not UTC ===')
// In IST, `new Date(2026, 3, 1).toISOString()` is 2026-03-31 — a month that
// starts a day early and silently pulls in the previous month's rent.
const april = periodRange('this-month', new Date(2026, 3, 15))
check('April starts on the 1st', april.from === '2026-04-01', april.from)
check('and ends on the 30th', april.to === '2026-04-30', april.to)
check('the 1st-of-April rent is inside April', inPeriod('2026-04-01', april))
check('and a 31 March bill is not', !inPeriod('2026-03-31', april))

const feb = periodRange('this-month', new Date(2028, 1, 10)) // leap year
check('February 2028 ends on the 29th', feb.to === '2028-02-29', feb.to)

console.log('\n=== every movement accumulates onto money in hand ===')
const april26 = moneyMovement(base, periodRange('this-month', new Date(2026, 3, 15)))
const may26 = moneyMovement(base, periodRange('this-month', new Date(2026, 4, 15)))
console.log(`  April: in ${april26.clientMoney} − jobs ${april26.projectSpend} − company ${april26.companySpend} = ${april26.net}`)
console.log(`  May:   in ${may26.clientMoney} − jobs ${may26.projectSpend} − company ${may26.companySpend} = ${may26.net}`)
check('April moved +448,500', april26.net === 700000 - 157500 - 94000, String(april26.net))
check('May moved −40,000 — the ad campaign alone', may26.net === -40000, String(may26.net))

const opening = base.accounts.reduce((t, a) => t + a.openingBalance, 0)
const accumulated = opening + april26.net + may26.net
console.log(`  opening ${opening} + April ${april26.net} + May ${may26.net} = ${accumulated}`)
check('the months add up to exactly money in hand', accumulated === hand.total, `${accumulated} vs ${hand.total}`)

// The whole reason the monthly figure is safe to show: it swings hard, and the
// accumulation is what makes that harmless.
check('one month is positive and the next negative', april26.net > 0 && may26.net < 0)
check('yet the total is still right', accumulated === 608500, String(accumulated))

console.log('\n=== a company bill only appears where it was asked for ===')
// It surfaced on the project dashboard's "latest entries" once, because one
// shared selector fed both that list and the Accounts movement list.
const projectFeed = combinedLedger(base, 'all', 20)
check('the default feed carries no company bill', projectFeed.every((r) => !r.company), JSON.stringify(projectFeed.filter((r) => r.company)))
check('and totals only the two project rows out', projectFeed.filter((r) => r.kind === 'out').length === 1, String(projectFeed.filter((r) => r.kind === 'out').length))

const accountsFeed = combinedLedger(base, 'all', undefined, { includeCompany: true })
check('asking for them gets all four company bills', accountsFeed.filter((r) => r.company).length === 4, String(accountsFeed.filter((r) => r.company).length))
check('each one flagged so it reads as company money', accountsFeed.filter((r) => r.company).every((r) => r.kind === 'out'))
check('scoped to a job, asking still gets none', combinedLedger(base, 'kothari', undefined, { includeCompany: true }).every((r) => !r.company))

console.log('\n=== none of it is ever sent to a procurement browser ===')
// filterStateFor is a pure function, so the real server rule can be checked
// here without a database. Money that never leaves the server cannot leak.
const sent = filterStateFor({ role: 'procurement' }, base)
check('companyExpenses is not in the payload at all', !('companyExpenses' in sent), JSON.stringify(Object.keys(sent)))
check('neither is offices', !('offices' in sent))
check('nor accounts, receipts or transfers', !['accounts', 'receipts', 'transfers'].some((k) => k in sent))
const asText = JSON.stringify(sent)
check('no company vendor name appears anywhere in it', !/Landlord|Agency/.test(asText))
check('and no company amount does either', !/60000|45000|25000/.test(asText))
check('but they still get the purchase lines they need', sent.expenses.length === 1)
check('with no rate on them', !('rate' in sent.expenses[0]), JSON.stringify(sent.expenses[0]))
// An owner is handed the state untouched — same object, nothing stripped.
check('an owner still gets everything', filterStateFor({ role: 'owner' }, base) === base)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
