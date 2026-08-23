import { useState } from 'react'
import { Link } from 'react-router-dom'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import ExpenseDialog from '../components/ExpenseDialog'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'
import { inventoryLeft, stockPool } from '../store/selectors'
import { downloadCSV, money, num, pct, shortDate, toCSV } from '../lib/format'

/**
 * Two questions, two views.
 *
 *   Stock in hand — "do we already own this?" Leftovers pooled across every
 *   project and grouped by item. This is the one that stops you buying ply you
 *   already have sitting on a finished site.
 *
 *   Purchase lines — "where did this come from?" Every stock-tracked bill, with
 *   how much of it has been consumed.
 */
export default function Inventory() {
  const state = useApp()
  const { scope } = useScope()
  const [view, setView] = useState('pool')
  const [showUsedUp, setShowUsedUp] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [editing, setEditing] = useState(null)

  const pool = stockPool(state)
  const scopedToProject = scope !== 'all'

  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Inventory view">
          <button
            role="tab"
            aria-selected={view === 'pool'}
            className={view === 'pool' ? 'is-on' : ''}
            onClick={() => setView('pool')}
          >
            Stock in hand
          </button>
          <button
            role="tab"
            aria-selected={view === 'lines'}
            className={view === 'lines' ? 'is-on' : ''}
            onClick={() => setView('lines')}
          >
            Purchase lines
          </button>
        </div>
        <div className="spacer" />
      </div>

      {view === 'pool' ? (
        <PoolView pool={pool} expanded={expanded} setExpanded={setExpanded} />
      ) : (
        <LinesView
          state={state}
          scope={scope}
          scopedToProject={scopedToProject}
          showUsedUp={showUsedUp}
          setShowUsedUp={setShowUsedUp}
          setEditing={setEditing}
        />
      )}

      {editing && <ExpenseDialog existing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/* ------------------------------------------------------- stock in hand ---- */

function PoolView({ pool, expanded, setExpanded }) {
  const exportPool = () => {
    const csv = toCSV(pool.items, [
      { label: 'Head', get: (i) => i.category },
      { label: 'Item', get: (i) => i.description },
      { label: 'Total left', get: (i) => i.qty },
      { label: 'Unit', get: (i) => i.unit },
      { label: 'Free to use', get: (i) => i.releasedQty },
      { label: 'On live jobs', get: (i) => i.committedQty },
      { label: 'Avg rate', get: (i) => Math.round(i.rate) },
      { label: 'Value', get: (i) => Math.round(i.value) },
      { label: 'Sitting in', get: (i) => i.sources.map((s) => `${s.projectName} (${num(s.qty)})`).join('; ') },
    ])
    downloadCSV('kalope-stock-in-hand.csv', csv)
  }

  return (
    <div className="stack">
      <div className="grid cols-3">
        <Measure
          label="Total stock in hand"
          value={pool.totalValue}
          tone="left"
          foot={`${pool.items.length} distinct item${pool.items.length === 1 ? '' : 's'} across all projects`}
        />
        <Measure
          label="Free to use"
          value={pool.releasedValue}
          tone="in"
          chip={<span className="chip ok">Jobs closed</span>}
          foot="Sitting on completed projects — move it to the next job instead of buying again."
        />
        <Measure
          label="On live jobs"
          value={pool.committedValue}
          tone="out"
          foot="Bought for projects still running. Some of this may still get used."
        />
      </div>

      {pool.splitAcrossProjects > 0 && (
        <Panel>
          <p className="note" style={{ margin: 0 }}>
            <strong>{pool.splitAcrossProjects}</strong> item
            {pool.splitAcrossProjects === 1 ? ' is' : 's are'} sitting in more than one project. Open a row to see
            where each part is before ordering more.
          </p>
        </Panel>
      )}

      <Panel
        title="What we already own"
        action={
          <button className="btn tiny" onClick={exportPool} disabled={!pool.items.length}>
            Export CSV
          </button>
        }
        flush
      >
        {pool.items.length === 0 ? (
          <Empty title="No stock left over">
            Once a stock-tracked purchase has more bought than used, the surplus appears here — pooled across every
            project, so you can see everything you own in one list.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="right">Total left</th>
                  <th className="right">Free to use</th>
                  <th className="right">On live jobs</th>
                  <th className="right">Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pool.items.map((item) => {
                  const open = expanded === item.key
                  return [
                    <tr key={item.key}>
                      <td>
                        <span className="tag-row">
                          <span className="chip out">{item.category}</span>
                          <strong style={{ fontWeight: 500 }}>{item.description}</strong>
                        </span>
                        <span className="sub-line">
                          in {item.sources.length} purchase
                          {item.sources.length === 1 ? '' : 's'} · avg {money(item.rate)}/{item.unit || 'unit'}
                        </span>
                      </td>
                      <td className="amount" style={{ fontWeight: 600 }}>
                        {num(item.qty)} <span className="note">{item.unit}</span>
                      </td>
                      <td className="amount pos">{item.releasedQty ? num(item.releasedQty) : '—'}</td>
                      <td className="amount note">{item.committedQty ? num(item.committedQty) : '—'}</td>
                      <td className="amount">{money(item.value)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn ghost tiny"
                            onClick={() => setExpanded(open ? null : item.key)}
                            aria-expanded={open}
                          >
                            {open ? 'Hide' : 'Where'}
                          </button>
                        </div>
                      </td>
                    </tr>,
                    open && (
                      <tr key={`${item.key}-where`} className="drawer-row">
                        <td colSpan="6">
                          <div className="drawer">
                            <span className="eyebrow">Sitting in</span>
                            <ul className="where-list">
                              {item.sources.map((s, i) => (
                                <li key={`${s.projectId}-${i}`}>
                                  <Link to={`/projects/${s.projectId}`}>{s.projectName}</Link>
                                  <span className={`chip ${s.released ? 'ok' : 'in'}`}>{s.status}</span>
                                  <span className="num">
                                    {num(s.qty)} {s.unit ?? item.unit} · {money(s.value)}
                                  </span>
                                  <span className="note">bought {shortDate(s.date)}</span>
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
              <tfoot>
                <tr>
                  <th colSpan="4" style={{ textAlign: 'right' }}>
                    Total stock in hand
                  </th>
                  <th className="amount" style={{ fontSize: 13, color: 'var(--patina)' }}>
                    {money(pool.totalValue)}
                  </th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------- purchase lines -- */

function LinesView({ state, scope, scopedToProject, showUsedUp, setShowUsedUp, setEditing }) {
  const projectName = Object.fromEntries(state.projects.map((p) => [p.id, p.name]))
  const { lines, totalValue } = inventoryLeft(state, scope)
  const visible = showUsedUp ? lines : lines.filter((l) => l.left > 0)

  const bought = lines.reduce((t, l) => t + l.qty * l.rate, 0)
  const consumed = lines.reduce((t, l) => t + l.used * l.rate, 0)

  const exportRows = () => {
    const csv = toCSV(visible, [
      { label: 'Date', get: (l) => l.date },
      { label: 'Project', get: (l) => projectName[l.projectId] ?? '' },
      { label: 'Head', get: (l) => l.category },
      { label: 'Item', get: (l) => l.description },
      { label: 'Bought', get: (l) => l.qty },
      { label: 'Used', get: (l) => l.used },
      { label: 'Left', get: (l) => l.left },
      { label: 'Unit', get: (l) => l.unit },
      { label: 'Rate', get: (l) => l.rate },
      { label: 'Value left', get: (l) => l.value },
    ])
    downloadCSV('kalope-inventory.csv', csv)
  }

  return (
    <div className="stack">
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showUsedUp} onChange={(e) => setShowUsedUp(e.target.checked)} />
          Show fully consumed lines
        </label>
        <div className="spacer" />
        <button className="btn" onClick={exportRows} disabled={!visible.length}>
          Export CSV
        </button>
      </div>

      <div className="grid cols-3">
        <Measure label="Material bought" value={bought} tone="out" foot={`${lines.length} stock-tracked purchase lines`} />
        <Measure
          label="Consumed on site"
          value={consumed}
          tone="out"
          foot={bought ? `${pct(consumed / bought)} of what was bought` : '—'}
        />
        <Measure
          label={scopedToProject ? 'Left on this project' : 'Left across all projects'}
          value={totalValue}
          tone="left"
          chip={<span className="chip ok">At purchase rate</span>}
          foot="Valued at what you paid, so it can move to another job rather than be written off."
        />
      </div>

      <Panel title="Every stock-tracked purchase" flush>
        {visible.length === 0 ? (
          <Empty title={lines.length ? 'Everything has been consumed' : 'No stock-tracked purchases yet'}>
            {lines.length
              ? 'Tick "Show fully consumed lines" to see the full purchase history.'
              : 'Heads marked as stock-tracked in Settings — Sheet, Hardware and Electric by default — show up here once you record a purchase.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Bought</th>
                  <th>Head / item</th>
                  <th className="right col-optional">Qty</th>
                  <th className="right col-optional">Used</th>
                  <th className="right">Left</th>
                  <th className="col-optional">Consumed</th>
                  <th className="right">Value left</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={l.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {shortDate(l.date)}
                      {!scopedToProject && <span className="sub-line">{projectName[l.projectId] ?? '—'}</span>}
                    </td>
                    <td>
                      <span className="chip out">{l.category}</span>
                      <span className="sub-line">
                        {l.description} · {l.vendor}
                      </span>
                    </td>
                    <td className="amount col-optional">
                      {num(l.qty)} <span className="note">{l.unit}</span>
                    </td>
                    <td className="amount col-optional">{num(l.used)}</td>
                    <td className="amount" style={{ fontWeight: 600 }}>
                      {num(l.left)} <span className="note">{l.unit}</span>
                    </td>
                    <td className="col-optional" style={{ minWidth: 110 }}>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${l.consumedPct * 100}%`, background: '#e07f31' }} />
                      </div>
                      <span className="sub-line num">{pct(l.consumedPct)}</span>
                    </td>
                    <td className="amount pos">{money(l.value)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn ghost tiny"
                          onClick={() => setEditing(state.expenses.find((e) => e.id === l.id))}
                        >
                          Update usage
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan="6" style={{ textAlign: 'right' }}>
                    Value left
                  </th>
                  <th className="amount" style={{ fontSize: 13, color: 'var(--patina)' }}>
                    {money(visible.reduce((t, l) => t + l.value, 0))}
                  </th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
