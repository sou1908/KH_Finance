/**
 * What is due, and when.
 *
 * Needs no database and no server:
 *
 *   npm run test:due
 *
 * This is the only arithmetic in the app about the future, and the month-end
 * cases are where it would quietly go wrong: rent due on the 31st still falls
 * due in February, and an EMI missed in March must not be replaced by April's.
 */
import { addDays, daysBetween, dueList, dueSoon, loanProgress, notices, occurrences } from './selectors.js'

let pass = 0, fail = 0
const check = (l, ok, d = '') => { ok ? (pass++, console.log(`  PASS  ${l}`)) : (fail++, console.log(`  FAIL  ${l}${d ? ' — ' + d : ''}`)) }

console.log('=== day arithmetic ===')
check('across a month end', daysBetween('2026-08-30', '2026-09-02') === 3)
check('backwards is negative', daysBetween('2026-09-02', '2026-08-30') === -3)
check('the same day is zero', daysBetween('2026-08-30', '2026-08-30') === 0)
// India has no daylight saving, but a browser set to a zone that does must not
// turn a whole day into 0.96 of one and round to the wrong answer.
check('across a spring-forward weekend', daysBetween('2026-03-27', '2026-03-30') === 3)
check('across a leap day', daysBetween('2028-02-28', '2028-03-01') === 2)
check('adding days rolls the month', addDays('2026-08-30', 3) === '2026-09-02', addDays('2026-08-30', 3))
check('and rolls the year', addDays('2026-12-30', 3) === '2027-01-02', addDays('2026-12-30', 3))

console.log('\n=== the 31st, which is the case that breaks ===')
const rent31 = { startDate: '2026-01-31', dayOfMonth: 31, everyMonths: 1 }
const firstHalf = occurrences(rent31, '2026-01-01', '2026-06-30')
console.log('  ' + firstHalf.join('  '))
check('February falls on the 28th, not skipped', firstHalf.includes('2026-02-28'), firstHalf.join(','))
check('April falls on the 30th', firstHalf.includes('2026-04-30'))
check('and January and March keep the 31st', firstHalf.includes('2026-01-31') && firstHalf.includes('2026-03-31'))
check('six months means six occurrences', firstHalf.length === 6, String(firstHalf.length))

const leap = occurrences({ startDate: '2028-01-31', dayOfMonth: 31, everyMonths: 1 }, '2028-02-01', '2028-02-29')
check('a leap February lands on the 29th', leap[0] === '2028-02-29', JSON.stringify(leap))

console.log('\n=== schedules ===')
check('quarterly steps three months', occurrences({ startDate: '2026-01-10', dayOfMonth: 10, everyMonths: 3 }, '2026-01-01', '2026-12-31').length === 4)
check('yearly steps twelve', occurrences({ startDate: '2026-06-01', dayOfMonth: 1, everyMonths: 12 }, '2026-01-01', '2028-12-31').length === 3)
check('a one-off falls due once', occurrences({ startDate: '2026-09-15', everyMonths: 0 }, '2026-01-01', '2026-12-31').length === 1)
check('an EMI stops at its last instalment', occurrences({ startDate: '2026-01-05', endDate: '2026-04-05', dayOfMonth: 5, everyMonths: 1 }, '2026-01-01', '2027-12-31').length === 4)
// Starting mid-month must not back-date into the days before it began.
check('starting on the 20th skips that month\'s 5th', !occurrences({ startDate: '2026-01-20', dayOfMonth: 5, everyMonths: 1 }, '2026-01-01', '2026-03-31').includes('2026-01-05'))
check('no start date means nothing is due', occurrences({ dayOfMonth: 5, everyMonths: 1 }, '2026-01-01', '2026-12-31').length === 0)

console.log('\n=== the due list ===')
const state = {
  categories: [{ id: 'cat_emi', name: 'Loan repayment', kind: 'company' }, { id: 'cat_rent', name: 'Rent', kind: 'company' }],
  accounts: [{ id: 'acc_co', name: 'Company A/C' }],
  commitments: [
    // Borrowed 5,00,000, repaying 18,000 a month for 36 months from Jan 2026.
    { id: 'cm_emi', kind: 'payable', name: 'Bank loan EMI', party: 'HDFC', amount: 18000, totalAmount: 648000,
      categoryId: 'cat_emi', accountId: 'acc_co', everyMonths: 1, dayOfMonth: 5,
      startDate: '2026-01-05', endDate: '2028-12-05', remindDays: 3, lastSettledOn: '2026-08-05', active: true },
    // Rent, already paid this month.
    { id: 'cm_rent', kind: 'payable', name: 'Andheri rent', party: 'S. Mehta', amount: 60000,
      categoryId: 'cat_rent', everyMonths: 1, dayOfMonth: 1,
      startDate: '2026-01-01', remindDays: 3, lastSettledOn: '2026-09-01', active: true },
    // Someone owes you, and the date has gone.
    { id: 'cm_lent', kind: 'receivable', name: 'Lent to Ramesh', party: 'Ramesh', amount: 200000,
      everyMonths: 0, startDate: '2026-08-20', remindDays: 5, active: true },
    // Switched off — must never appear.
    { id: 'cm_off', kind: 'payable', name: 'Old insurance', amount: 5000,
      everyMonths: 12, dayOfMonth: 1, startDate: '2026-01-01', active: false },
  ],
  companyExpenses: [
    { id: 'x1', commitmentId: 'cm_emi', amount: 18000, date: '2026-07-05' },
    { id: 'x2', commitmentId: 'cm_emi', amount: 18000, date: '2026-08-05' },
    { id: 'x3', amount: 60000, date: '2026-09-01' },
  ],
  expenses: [], receipts: [], projects: [], offices: [], vendors: [], items: [], transfers: [], movements: [], clients: [],
}

// Pretend today is 2 September 2026.
const today = '2026-09-02'
const due = dueList(state, { today, horizonDays: 45 })
console.log('  ' + due.map((d) => `${d.name} → ${d.due} (${d.daysAway}d)`).join('\n  '))

check('the switched-off one never appears', !due.some((d) => d.id === 'cm_off'))
check('three commitments are live', due.length === 3, String(due.length))
check('soonest first', due[0].due <= due[1].due && due[1].due <= due[2].due)

const emi = due.find((d) => d.id === 'cm_emi')
check('the EMI is next due 5 Sep, not 5 Aug again', emi.due === '2026-09-05', emi.due)
check('three days away', emi.daysAway === 3, String(emi.daysAway))
check('so it is inside its 3-day warning', emi.soon && emi.needsAttention)
check('and is not overdue', !emi.overdue)

const rent = due.find((d) => d.id === 'cm_rent')
check('rent paid on the 1st rolls to next month', rent.due === '2026-10-01', rent.due)
check('and is far enough off to stay quiet', !rent.needsAttention, String(rent.daysAway))

const lent = due.find((d) => d.id === 'cm_lent')
check('the money owed to you is overdue', lent.overdue)
check('by 13 days', lent.daysAway === -13, String(lent.daysAway))
check('overdue always needs attention', lent.needsAttention)

console.log('\n=== a missed instalment is not silently replaced ===')
// Nothing recorded since March: the list must still point at April, and say
// how many went by.
const behind = dueList({ ...state, commitments: [{ ...state.commitments[0], lastSettledOn: '2026-03-05' }] }, { today })
check('it still points at the oldest unpaid, April', behind[0].due === '2026-04-05', behind[0].due)
check('five instalments are past due — Apr to Aug', behind[0].overdueCount === 5, String(behind[0].overdueCount))
check('four of them besides the one shown', behind[0].missed === 4, String(behind[0].missed))
check('reported as 150 days late', behind[0].daysAway === -150, String(behind[0].daysAway))
// September's instalment is only three days away, so it has not been missed.
check('the count ignores what has not fallen due yet', behind[0].overdueCount === 5)
// And looking further ahead must not change a count about the past.
const far = dueList({ ...state, commitments: [{ ...state.commitments[0], lastSettledOn: '2026-03-05' }] }, { today, horizonDays: 365 })
check('looking a year ahead reports the same five', far[0].overdueCount === 5, String(far[0].overdueCount))

console.log('\n=== how much of the loan is left ===')
const progress = loanProgress(state, state.commitments[0])
check('36,000 repaid so far', progress.paid === 36000, String(progress.paid))
check('6,12,000 still to go', progress.outstanding === 612000, String(progress.outstanding))
check('an ordinary bill tracks no balance', loanProgress(state, state.commitments[1]).tracksBalance === false)
// Overpaying must not produce a negative balance to repay.
check('paying more than the total floors at zero', loanProgress({ companyExpenses: [{ commitmentId: 'z', amount: 99999999 }] }, { id: 'z', totalAmount: 1000 }).outstanding === 0)

console.log('\n=== only the urgent ones interrupt you ===')
const soon = dueSoon(state, { today })
check('two need attention, not three', soon.length === 2, soon.map((s) => s.name).join(', '))
check('the EMI and the overdue loan', soon.some((s) => s.id === 'cm_emi') && soon.some((s) => s.id === 'cm_lent'))
check('next month\'s rent is left alone', !soon.some((s) => s.id === 'cm_rent'))
check('nothing at all when there are no commitments', dueSoon({ ...state, commitments: [] }, { today }).length === 0)

console.log('\n=== notices, and what a dismissal is allowed to hide ===')
const list = notices(state, { today })
check('one notice per urgent item', list.length === 2, String(list.length))
check('keyed by occurrence, not by commitment', list.every((n) => /:\d{4}-\d{2}-\d{2}$/.test(n.key)), JSON.stringify(list.map((n) => n.key)))
check('the EMI notice names September', list.some((n) => n.key === 'cm_emi:2026-09-05'), JSON.stringify(list.map((n) => n.key)))
check('urgency is plain enough to style on', list.map((n) => n.urgency).sort().join(',') === 'late,soon')

// The point of keying by date: dismissing September must not silence October.
const october = notices({ ...state, commitments: [{ ...state.commitments[0], lastSettledOn: '2026-09-05' }] }, { today: '2026-10-02' })
check('next month is a different key entirely', october[0].key === 'cm_emi:2026-10-05', october[0]?.key)

// And once it is actually paid, the key it was dismissed under never recurs.
const paid = notices({ ...state, commitments: [{ ...state.commitments[0], lastSettledOn: '2026-09-05' }] }, { today })
check('paying it removes the notice', !paid.some((n) => n.commitmentId === 'cm_emi'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
