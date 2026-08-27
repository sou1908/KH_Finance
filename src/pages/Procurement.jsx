import { useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import MovementDialog from '../components/MovementDialog'
import { useApp } from '../store/AppStore'
import { movementHistory, outstandingMaterial } from '../store/selectors'
import { num, shortDate } from '../lib/format'

/**
 * The procurement screen.
 *
 * Deliberately the whole app for that role: no money, no navigation, one job —
 * say what happened to the material. It is built for a phone held in one hand
 * on a site, so the primary action is large and the table is short.
 *
 * There are no rupee figures anywhere on this page, and there is nothing to
 * hide either: the server never sends them to a procurement account.
 */
export default function Procurement() {
  const state = useApp()
  const [dialog, setDialog] = useState(null)
  const [projectFilter, setProjectFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)

  const { lines, totalLeft } = outstandingMaterial(state, projectFilter)

  // Only the projects that actually have material standing on them.
  const holding = outstandingMaterial(state, 'all').lines
  const projectsWithStock = [...new Map(holding.map((l) => [l.projectId, l.projectName])).entries()]

  const jobsCount = new Set(lines.map((l) => l.projectId)).size

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Procurement</span>
          <h1>Material still to deploy</h1>
          <div className="crumb">
            What has been bought and not yet used. Record what goes to site, or move what is spare to another job.
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="grid cols-2">
          <Measure
            label="Lines outstanding"
            raw={String(lines.length)}
            isText
            tone="in"
            foot={`across ${jobsCount} job${jobsCount === 1 ? '' : 's'}`}
          />
          <Measure
            label="Units in hand"
            raw={num(Math.round(totalLeft * 100) / 100)}
            isText
            tone="left"
            foot="Mixed units — see each line for what it is measured in."
          />
        </div>

        {projectsWithStock.length > 1 && (
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filter by job">
              <option value="all">All jobs</option>
              {projectsWithStock.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        <Panel title="Outstanding material" flush>
          {lines.length === 0 ? (
            <Empty title="Nothing outstanding">
              Every stock-tracked item bought so far has been used, moved on, or returned. New purchases appear
              here as soon as they are recorded.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="col-optional">Job</th>
                    <th className="col-optional">From</th>
                    <th className="right">Bought</th>
                    <th className="right">Used</th>
                    <th className="right">Left</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const history = movementHistory(state, line.expenseId)
                    const open = expanded === line.key

                    return [
                      <tr key={line.key}>
                        <td>
                          <span className="tag-row">
                            <span className="chip out">{line.category}</span>
                            <strong style={{ fontWeight: 500 }}>{line.description}</strong>
                          </span>
                          <span className="sub-line">
                            bought {shortDate(line.date)}
                            {line.isElsewhere && ' · moved here from another job'}
                          </span>
                        </td>
                        <td className="note col-optional">{line.projectName}</td>
                        <td className="note col-optional">{line.vendor || '—'}</td>
                        <td className="amount note">
                          {num(line.qty)} <span className="note">{line.unit}</span>
                        </td>
                        <td className="amount note">{num(line.used)}</td>
                        <td className="amount" style={{ fontWeight: 600 }}>
                          {num(line.left)} <span className="note">{line.unit}</span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="btn tiny primary" onClick={() => setDialog(line)}>
                              Record
                            </button>
                            {history.length > 0 && (
                              <button
                                className="btn ghost tiny"
                                onClick={() => setExpanded(open ? null : line.key)}
                                aria-expanded={open}
                              >
                                {open ? 'Hide' : `History (${history.length})`}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>,

                      open && (
                        <tr key={`${line.key}-history`} className="drawer-row">
                          <td colSpan="7">
                            <div className="drawer">
                              <span className="eyebrow">What has happened to this line</span>
                              <ul className="where-list">
                                {history.map((m) => (
                                  <li key={m.id}>
                                    <span className="num">{shortDate(m.date)}</span>
                                    <span className={`chip ${m.type === 'used' ? 'out' : m.type === 'moved' ? 'in' : ''}`}>
                                      {m.type}
                                    </span>
                                    <span className="num">
                                      {num(m.qty)} {line.unit}
                                    </span>
                                    {m.type === 'moved' && (
                                      <span className="note">
                                        {m.fromName} → {m.toName}
                                      </span>
                                    )}
                                    {m.note && <span className="note">{m.note}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {dialog && <MovementDialog line={dialog} onClose={() => setDialog(null)} />}
    </>
  )
}
