import { useState } from 'react'
import { Link } from 'react-router-dom'
import Panel, { Empty } from '../components/Panel'
import ProjectDialog from '../components/ProjectDialog'
import Caliper from '../components/Caliper'
import ContactLinks from '../components/ContactLinks'
import { useApp } from '../store/AppStore'
import { projectSummaries } from '../store/selectors'
import { money, moneyShort, pct, shortDate } from '../lib/format'
import { projectContact } from '../lib/phone'

export default function Projects() {
  const state = useApp()
  const [dialog, setDialog] = useState(null)
  const [status, setStatus] = useState('All')
  const [query, setQuery] = useState('')

  const clientById = Object.fromEntries(state.clients.map((c) => [c.id, c]))

  const rows = projectSummaries(state).filter((p) => {
    const matchesStatus = status === 'All' || p.status === status
    const q = query.trim().toLowerCase()
    const matchesQuery =
      !q || [p.name, p.clientName, p.site].some((v) => (v || '').toLowerCase().includes(q))
    return matchesStatus && matchesQuery
  })

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects, clients, sites"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {['All', 'Active', 'On hold', 'Completed'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setDialog({})}>
          New project
        </button>
      </div>

      {rows.length === 0 ? (
        <Panel>
          <Empty
            title={state.projects.length ? 'No projects match' : 'No projects yet'}
            action={
              state.projects.length ? null : (
                <button className="btn primary" onClick={() => setDialog({})}>
                  Create a project
                </button>
              )
            }
          >
            {state.projects.length
              ? 'Clear the search or change the status filter.'
              : 'Start with the job name and the quoted value — the rest fills in as you record bills.'}
          </Empty>
        </Panel>
      ) : (
        <div className="grid cols-2">
          {rows.map((p) => (
            <article key={p.id} className="card-link project-card">
              <div className="tag-row" style={{ marginBottom: 8 }}>
                <span className={`chip ${p.status === 'Active' ? 'in' : p.status === 'Completed' ? 'ok' : ''}`}>
                  {p.status}
                </span>
                <span className="eyebrow">{p.clientName}</span>
              </div>

              {/* The heading link is stretched over the whole card, so the card
                  stays clickable while the phone and WhatsApp links above it
                  remain separately tappable. Nesting anchors would be invalid. */}
              <h3 style={{ fontSize: 16 }}>
                <Link className="stretched" to={`/projects/${p.id}`}>
                  {p.name}
                </Link>
              </h3>
              <div className="note" style={{ marginTop: 2 }}>
                {p.site || 'Site not set'} · started {shortDate(p.startDate)}
              </div>

              <ContactLinks contact={projectContact(p, clientById[p.clientId])} size="small" />

              <div className="grid cols-3" style={{ margin: '16px 0 14px', gap: 12 }}>
                <Stat label="In" value={moneyShort(p.incoming)} tone="" />
                <Stat label="Out" value={moneyShort(p.expenditure)} tone="" />
                <Stat
                  label={p.remaining < 0 ? 'Short' : 'Left'}
                  value={moneyShort(Math.abs(p.remaining))}
                  tone={p.remaining < 0 ? 'neg' : 'pos'}
                />
              </div>

              <Caliper
                label="Reading"
                spent={p.expenditure}
                received={p.incoming}
                hint={p.quoted ? `${pct(p.quoteRatio)} of ${money(p.quoted)} quote` : `${money(p.incoming)} received`}
              />
            </article>
          ))}
        </div>
      )}

      {dialog && <ProjectDialog existing={dialog.id ? dialog : null} onClose={() => setDialog(null)} />}
    </>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`figure ${tone}`} style={{ fontSize: 16, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}
