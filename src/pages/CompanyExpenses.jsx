import { useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import CompanyExpenseDialog from '../components/CompanyExpenseDialog'
import { AttachmentCount } from '../components/Attachments'
import { useApp } from '../store/AppStore'
import { PERIODS, companyTotals, periodRange } from '../store/selectors'
import { downloadCSV, money, pct, shortDate, toCSV } from '../lib/format'

/**
 * The company ledger: every bill the business pays to keep itself running.
 *
 * The project scope picker is deliberately absent. None of these rows belong to
 * a job, so filtering them by one would either show nothing or show everything,
 * and both would be lying about what the filter did.
 */
export default function CompanyExpenses() {
  const state = useApp()
  const [dialog, setDialog] = useState(null)
  const [period, setPeriod] = useState('fy')
  const [head, setHead] = useState('all')
  const [office, setOffice] = useState('all')
  const [query, setQuery] = useState('')

  const range = periodRange(period)
  const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))
  const officeName = Object.fromEntries(state.offices.map((o) => [o.id, o.name]))
  const accountName = Object.fromEntries(state.accounts.map((a) => [a.id, a.name]))

  const totals = companyTotals(state, range)

  const rows = totals.rows
    .filter((e) => head === 'all' || e.categoryId === head)
    // An empty officeId is company-wide, which is a real answer rather than a
    // missing one, so it gets its own filter value.
    .filter((e) => office === 'all' || (office === 'none' ? !e.officeId : e.officeId === office))
    .filter((e) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return [e.vendor, e.description, e.billNo, catName[e.categoryId]].some((v) =>
        (v || '').toLowerCase().includes(q),
      )
    })

  const shown = rows.reduce((t, e) => t + (Number(e.amount) || 0), 0)
  const biggest = totals.byHead[0]
  const topOffice = totals.byOffice[0]

  const exportRows = () => {
    const csv = toCSV(rows, [
      { label: 'Date', get: (e) => e.date },
      { label: 'Head', get: (e) => catName[e.categoryId] ?? '' },
      { label: 'Office', get: (e) => (e.officeId ? officeName[e.officeId] ?? '' : 'Company-wide') },
      { label: 'Paid to', get: (e) => e.vendor },
      { label: 'What for', get: (e) => e.description },
      { label: 'Amount', get: (e) => e.amount },
      { label: 'Paid from', get: (e) => accountName[e.accountId] ?? '' },
      { label: 'Bill no', get: (e) => e.billNo },
    ])
    downloadCSV(`kalope-company-expenses-${range.label.replace(/\s+/g, '-').toLowerCase()}.csv`, csv)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Company</span>
          <h1>Company expenses</h1>
          <div className="crumb">
            What the business costs to run, whatever jobs are on. None of this is charged to a client.
          </div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bills, vendors, descriptions"
        />
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={head} onChange={(e) => setHead(e.target.value)} aria-label="Filter by head">
          <option value="all">All heads</option>
          {totals.byHead.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <select value={office} onChange={(e) => setOffice(e.target.value)} aria-label="Filter by office">
          <option value="all">All offices</option>
          {state.offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="none">Company-wide</option>
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
          <Measure
            label={`Spent · ${range.label}`}
            value={shown}
            tone="out"
            foot={`${rows.length} bill${rows.length === 1 ? '' : 's'}`}
          />
          <Measure
            label="Biggest head"
            raw={biggest?.name ?? '—'}
            isText
            tone="out"
            foot={biggest ? `${money(biggest.amount)} · ${pct(biggest.share)} of the period` : 'Nothing recorded yet'}
          />
          <Measure
            label="Costs the most"
            raw={topOffice?.name ?? '—'}
            isText
            tone="out"
            foot={topOffice ? `${money(topOffice.amount)} · ${pct(topOffice.share)} of the period` : 'No offices set up'}
          />
        </div>

        <Panel title={`Company expenses · ${range.label}`} flush>
          {rows.length === 0 ? (
            <Empty
              title="Nothing recorded here"
              action={
                <button className="btn primary" onClick={() => setDialog({})}>
                  Record an expense
                </button>
              }
            >
              Rent, electricity, internet, marketing, EMIs — file each one under a head and an office, and the
              company dashboard fills itself in.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data tap-rows">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Head</th>
                    <th>Paid to / what for</th>
                    <th className="col-optional">Office</th>
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
                      </td>
                      <td>
                        <span className="tag-row">
                          {e.vendor || '—'} <AttachmentCount items={e.attachments} />
                        </span>
                        {e.description && <span className="sub-line">{e.description}</span>}
                      </td>
                      <td className="note col-optional">
                        {e.officeId ? officeName[e.officeId] ?? '—' : 'Company-wide'}
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
                              ev.stopPropagation()
                              if (window.confirm(`Delete this ${money(e.amount)} expense?`)) {
                                state.remove('companyExpenses', e.id)
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
                      {money(shown)}
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
        <CompanyExpenseDialog existing={dialog.id ? dialog : null} onClose={() => setDialog(null)} />
      )}
    </>
  )
}
