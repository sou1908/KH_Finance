import { useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import ReceiptDialog from '../components/ReceiptDialog'
import { AttachmentCount } from '../components/Attachments'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'
import { accountLedger, byProject } from '../store/selectors'
import { downloadCSV, money, shortDate, toCSV } from '../lib/format'

export default function Incoming() {
  const state = useApp()
  const { scope } = useScope()
  const [dialog, setDialog] = useState(null)
  const [account, setAccount] = useState('all')
  const [query, setQuery] = useState('')

  const projectName = Object.fromEntries(state.projects.map((p) => [p.id, p.name]))
  const accountName = Object.fromEntries(state.accounts.map((a) => [a.id, a.name]))

  const rows = byProject(state.receipts, scope)
    .filter((r) => account === 'all' || r.accountId === account)
    .filter((r) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return [r.note, r.reference, r.mode, projectName[r.projectId]].some((v) =>
        (v || '').toLowerCase().includes(q),
      )
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const total = rows.reduce((t, r) => t + (Number(r.amount) || 0), 0)
  const channels = accountLedger(state, scope)
    .filter((a) => a.inflow > 0)
    .sort((a, b) => b.inflow - a.inflow)

  const exportRows = () => {
    const csv = toCSV(rows, [
      { label: 'Date', get: (r) => r.date },
      { label: 'Project', get: (r) => projectName[r.projectId] ?? '' },
      { label: 'Amount', get: (r) => r.amount },
      { label: 'Account', get: (r) => accountName[r.accountId] ?? '' },
      { label: 'Mode', get: (r) => r.mode },
      { label: 'Reference', get: (r) => r.reference },
      { label: 'Note', get: (r) => r.note },
    ])
    downloadCSV('kalope-incoming.csv', csv)
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes, references, projects"
        />
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
          Record a payment
        </button>
      </div>

      <div className="stack">
        <div className="grid cols-3">
          <Measure label="Shown here" value={total} tone="in" foot={`${rows.length} receipt${rows.length === 1 ? '' : 's'}`} />
          {channels.slice(0, 2).map((c) => (
            <Measure
              key={c.id}
              label={c.name}
              value={c.inflow}
              tone="in"
              foot={`${((c.inflow / (total || 1)) * 100).toFixed(0)}% of what's shown`}
            />
          ))}
        </div>

        <Panel title="Receipts" flush>
          {rows.length === 0 ? (
            <Empty
              title="No receipts here"
              action={
                <button className="btn primary" onClick={() => setDialog({})}>
                  Record a payment
                </button>
              }
            >
              Client payments recorded here feed every total in the app.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data tap-rows">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Project</th>
                    <th>Received in</th>
                    <th className="col-optional">Reference</th>
                    <th className="right col-money">Amount</th>
                    <th className="col-optional" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setDialog(r)}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {shortDate(r.date)}
                      </td>
                      <td>
                        <span className="tag-row">
                          {projectName[r.projectId] ?? '—'} <AttachmentCount items={r.attachments} />
                        </span>
                        {r.note && <span className="sub-line">{r.note}</span>}
                      </td>
                      <td>
                        <span className="chip in">{accountName[r.accountId] ?? '—'}</span>
                      </td>
                      <td className="note col-optional">
                        {r.mode}
                        {r.reference ? ` · ${r.reference}` : ''}
                      </td>
                      <td className="amount pos col-money">{money(r.amount)}</td>
                      <td className="col-optional">
                        <div className="row-actions">
                          <button className="btn ghost tiny" onClick={() => setDialog(r)}>
                            Edit
                          </button>
                          <button
                            className="btn ghost tiny danger"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              if (window.confirm(`Delete this ${money(r.amount)} receipt?`)) {
                                state.remove('receipts', r.id)
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
                    <th colSpan="4" style={{ textAlign: 'right' }}>
                      Total shown
                    </th>
                    <th className="amount col-money" style={{ fontSize: 13, color: 'var(--patina)' }}>
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
        <ReceiptDialog
          existing={dialog.id ? dialog : null}
          lockedProject={dialog.id ? null : scope !== 'all' ? scope : null}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}
