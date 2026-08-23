import { useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import ExpenseDialog from '../components/ExpenseDialog'
import { AttachmentCount } from '../components/Attachments'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'
import { byProject, categoryBreakdown } from '../store/selectors'
import { downloadCSV, money, num, pct, shortDate, toCSV } from '../lib/format'

export default function Expenses() {
  const state = useApp()
  const { scope } = useScope()
  const [dialog, setDialog] = useState(null)
  const [head, setHead] = useState('all')
  const [account, setAccount] = useState('all')
  const [query, setQuery] = useState('')

  const projectName = Object.fromEntries(state.projects.map((p) => [p.id, p.name]))
  const accountName = Object.fromEntries(state.accounts.map((a) => [a.id, a.name]))
  const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))

  const rows = byProject(state.expenses, scope)
    .filter((e) => head === 'all' || e.categoryId === head)
    .filter((e) => account === 'all' || e.accountId === account)
    .filter((e) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return [e.vendor, e.description, e.billNo, projectName[e.projectId]].some((v) =>
        (v || '').toLowerCase().includes(q),
      )
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const total = rows.reduce((t, e) => t + (Number(e.amount) || 0), 0)
  const breakdown = categoryBreakdown(state, scope).filter((c) => c.amount > 0)
  const biggest = breakdown[0]

  const exportRows = () => {
    const csv = toCSV(rows, [
      { label: 'Date', get: (e) => e.date },
      { label: 'Project', get: (e) => projectName[e.projectId] ?? '' },
      { label: 'Head', get: (e) => catName[e.categoryId] ?? '' },
      { label: 'Vendor', get: (e) => e.vendor },
      { label: 'Description', get: (e) => e.description },
      { label: 'Qty', get: (e) => e.qty },
      { label: 'Unit', get: (e) => e.unit },
      { label: 'Rate', get: (e) => e.rate },
      { label: 'Amount', get: (e) => e.amount },
      { label: 'Paid from', get: (e) => accountName[e.accountId] ?? '' },
      { label: 'Bill no', get: (e) => e.billNo },
    ])
    downloadCSV('kalope-expenditure.csv', csv)
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vendors, bills, descriptions"
        />
        <select value={head} onChange={(e) => setHead(e.target.value)} aria-label="Filter by head">
          <option value="all">All heads</option>
          {state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Filter by account">
          <option value="all">All accounts</option>
          {state.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button className="btn" onClick={exportRows} disabled={!rows.length}>
          Export CSV
        </button>
        <button className="btn primary" onClick={() => setDialog({})}>
          Record an expense
        </button>
      </div>

      <div className="stack">
        <div className="grid cols-3">
          <Measure label="Shown here" value={total} tone="out" foot={`${rows.length} bill${rows.length === 1 ? '' : 's'}`} />
          <Measure
            label="Biggest head"
            raw={biggest?.name ?? '—'}
            isText
            tone="out"
            foot={biggest ? `${money(biggest.amount)} · ${pct(biggest.share)} of all spending` : 'No bills yet'}
          />
          <Measure
            label="Heads in use"
            raw={String(breakdown.length)}
            tone="out"
            foot={`of ${state.categories.length} set up in Settings`}
          />
        </div>

        <Panel title="Expenditure" flush>
          {rows.length === 0 ? (
            <Empty
              title="No expenses here"
              action={
                <button className="btn primary" onClick={() => setDialog({})}>
                  Record an expense
                </button>
              }
            >
              File every bill under a head and an account, and the totals take care of themselves.
            </Empty>
          ) : (
            <div className="table-wrap">
              {/* tap-rows: on a phone the action buttons are hidden and the row
                  itself opens the entry, freeing the width the amount needs. */}
              <table className="data tap-rows">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Head</th>
                    <th>Vendor / description</th>
                    <th className="right col-optional">Qty × rate</th>
                    <th className="col-optional">Paid from</th>
                    <th className="right col-money">Amount</th>
                    <th className="col-optional" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} onClick={() => setDialog(e)}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {shortDate(e.date)}
                      </td>
                      <td>
                        <span className="chip out">{catName[e.categoryId] ?? '—'}</span>
                        {scope === 'all' && <span className="sub-line">{projectName[e.projectId] ?? '—'}</span>}
                      </td>
                      <td>
                        <span className="tag-row">
                          {e.vendor || '—'} <AttachmentCount items={e.attachments} />
                        </span>
                        {e.description && <span className="sub-line">{e.description}</span>}
                      </td>
                      <td className="amount note col-optional">
                        {Number(e.qty) ? `${num(e.qty)} ${e.unit || ''} × ${money(e.rate)}` : '—'}
                        {e.billNo && <span className="sub-line">Bill {e.billNo}</span>}
                      </td>
                      <td className="note col-optional">{accountName[e.accountId] ?? '—'}</td>
                      <td className="amount col-money">{money(e.amount)}</td>
                      <td className="col-optional">
                        <div className="row-actions">
                          <button className="btn ghost tiny" onClick={() => setDialog(e)}>
                            Edit
                          </button>
                          <button
                            className="btn ghost tiny danger"
                            onClick={(ev) => {
                              // The row is clickable too; don't open the editor
                              // on top of the delete prompt.
                              ev.stopPropagation()
                              if (window.confirm(`Delete this ${money(e.amount)} expense?`)) {
                                state.remove('expenses', e.id)
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="5" style={{ textAlign: 'right' }}>
                      Total shown
                    </th>
                    <th className="amount col-money" style={{ fontSize: 13, color: 'var(--ember)' }}>
                      {money(total)}
                    </th>
                    <th className="col-optional" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {dialog && (
        <ExpenseDialog
          existing={dialog.id ? dialog : null}
          lockedProject={dialog.id ? null : scope !== 'all' ? scope : null}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}
