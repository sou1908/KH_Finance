import { useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import CommitmentDialog from '../components/CommitmentDialog'
import CompanyExpenseDialog from '../components/CompanyExpenseDialog'
import { whenLabel } from '../components/DueBanner'
import { useApp } from '../store/AppStore'
import { dueList, todayISO } from '../store/selectors'
import { money, shortDate } from '../lib/format'

/**
 * Everything coming up, and everything already late.
 *
 * Recording a payment does not tick a box here — it opens the ordinary company
 * expense form with the details filled in. The bill that results is the record;
 * this page only stamps the date it was settled so the reminder rolls on to
 * next month. A reminder that could be marked "done" without a bill existing
 * would quietly drift away from the ledger.
 */
export default function Due() {
  const state = useApp()
  const [editing, setEditing] = useState(null)
  const [paying, setPaying] = useState(null)

  const today = todayISO()
  const rows = dueList(state, { today, horizonDays: 60 })

  const late = rows.filter((r) => r.overdue)
  const attention = rows.filter((r) => r.needsAttention)
  const owed = rows.filter((r) => r.kind === 'receivable')
  const owedTotal = owed.reduce((t, r) => t + (Number(r.amount) || 0), 0)

  /**
   * Money going out settles by recording the bill it becomes. Money coming back
   * is whatever movement it really was — a transfer back from wherever it was
   * parked — so that one only stamps the date.
   */
  const settle = (row) => {
    if (row.kind === 'payable') {
      setPaying(row)
      return
    }
    if (!window.confirm(`Mark "${row.name}" as received?\n\nRecord the money itself against the account it landed in.`)) return
    state.update('commitments', { id: row.id, lastSettledOn: row.due })
  }

  const onPaid = () => {
    // Stamped only once the bill is actually saved, so a cancelled form leaves
    // the reminder standing.
    if (paying) state.update('commitments', { id: paying.id, lastSettledOn: paying.due })
    setPaying(null)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Company</span>
          <h1>What's due</h1>
          <div className="crumb">
            EMIs, rent, bills and anyone who owes you. Reminders only — nothing here has been paid.
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => setEditing({})}>
          Add a reminder
        </button>
      </div>

      <div className="stack">
        <div className="grid cols-3">
          <Measure
            label="Needs attention"
            raw={String(attention.length)}
            tone={late.length ? 'warn' : 'out'}
            foot={
              late.length
                ? `${late.length} already late — the oldest since ${shortDate(late[0].due)}`
                : attention.length
                  ? 'Due within the warning window you set'
                  : 'Nothing due in the next few days'
            }
          />
          <Measure
            label="Going out in 60 days"
            value={rows.filter((r) => r.kind === 'payable').reduce((t, r) => t + (Number(r.amount) || 0), 0)}
            tone="out"
            foot={`${rows.filter((r) => r.kind === 'payable').length} payment${
              rows.filter((r) => r.kind === 'payable').length === 1 ? '' : 's'
            } scheduled`}
          />
          <Measure
            label="Owed to you"
            value={owedTotal}
            tone="in"
            foot={owed.length ? `${owed.length} to chase` : 'Nobody owes you on a date'}
          />
        </div>

        <Panel title="Due soonest first" flush>
          {rows.length === 0 ? (
            <Empty
              title="Nothing scheduled"
              action={
                <button className="btn primary" onClick={() => setEditing({})}>
                  Add your first reminder
                </button>
              }
            >
              Add the EMI, the rent, the internet bill — anything that comes round on a date. The dashboard warns you
              before each one, and you record the payment straight from here.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data tap-rows">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th className="col-optional">Head / account</th>
                    <th className="right col-money">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.overdue ? 'is-late' : ''}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={`chip ${r.overdue ? 'warn' : r.needsAttention ? 'out' : ''}`}>
                          {whenLabel(r)}
                        </span>
                        <span className="sub-line num">{shortDate(r.due)}</span>
                      </td>
                      <td>
                        <span className="tag-row">
                          {r.name}
                          {r.kind === 'receivable' && <span className="chip in">Owed to you</span>}
                        </span>
                        <span className="sub-line">
                          {r.party || '—'}
                          {r.overdueCount > 1 && ` · ${r.overdueCount} instalments unrecorded`}
                          {r.tracksBalance && ` · ${money(r.outstanding)} still to go`}
                        </span>
                      </td>
                      <td className="note col-optional">
                        {r.categoryName || '—'}
                        {r.accountName && <span className="sub-line">{r.accountName}</span>}
                      </td>
                      <td className="amount col-money">
                        {Number(r.amount) > 0 ? money(r.amount) : <span className="note">Varies</span>}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn tiny" onClick={() => settle(r)}>
                            {r.kind === 'payable' ? 'Record payment' : 'Mark received'}
                          </button>
                          <button className="btn ghost tiny" onClick={() => setEditing(r)}>
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <ScheduleList state={state} setEditing={setEditing} />
      </div>

      {editing && (
        <CommitmentDialog existing={editing.id ? editing : null} onClose={() => setEditing(null)} />
      )}

      {paying && (
        <CompanyExpenseDialog
          preset={{
            date: paying.due,
            categoryId: paying.categoryId,
            officeId: paying.officeId,
            accountId: paying.accountId,
            vendor: paying.party,
            description: paying.name,
            amount: Number(paying.amount) || '',
            commitmentId: paying.id,
          }}
          onSaved={onPaid}
          onClose={() => setPaying(null)}
        />
      )}
    </>
  )
}

/**
 * Everything set up, including what has been switched off — otherwise a
 * reminder someone paused has no screen that can find it again.
 */
function ScheduleList({ state, setEditing }) {
  const all = state.commitments ?? []
  if (!all.length) return null

  return (
    <Panel title={`Every reminder · ${all.length}`} flush>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th className="col-optional">Who</th>
              <th>How often</th>
              <th className="right col-optional">Amount</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {all.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td className="note col-optional">{c.party || '—'}</td>
                <td className="note">{everyLabel(c)}</td>
                <td className="amount col-optional">{Number(c.amount) > 0 ? money(c.amount) : '—'}</td>
                <td>
                  {c.active === false ? (
                    <span className="chip">Paused</span>
                  ) : (
                    <span className="chip ok">On</span>
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn ghost tiny" onClick={() => setEditing(c)}>
                      Edit
                    </button>
                    <button
                      className="btn ghost tiny danger"
                      onClick={() =>
                        window.confirm(
                          `Remove the reminder for "${c.name}"?\n\nBills already recorded against it are not affected.`,
                        ) && state.remove('commitments', c.id)
                      }
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function everyLabel(c) {
  const every = Number(c.everyMonths) || 0
  if (!every) return `Once, on ${shortDate(c.startDate)}`
  const day = Number(c.dayOfMonth) || 1
  const period =
    every === 1 ? 'Monthly' : every === 12 ? 'Yearly' : `Every ${every} months`
  return `${period} on the ${ordinal(day)}`
}

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
