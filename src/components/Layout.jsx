import { NavLink, Outlet, useLocation } from 'react-router-dom'
import QuickAdd from './QuickAdd'
import SyncStatus from './SyncStatus'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'
import { moneyInHand } from '../store/selectors'
import { money } from '../lib/format'

const NAV = [
  {
    group: 'Projects',
    items: [
      { to: '/', label: 'Dashboard', tick: '00', end: true },
      { to: '/projects', label: 'Projects', tick: '01' },
      { to: '/incoming', label: 'Incoming', tick: '02' },
      { to: '/expenses', label: 'Expenditure', tick: '03' },
      { to: '/inventory', label: 'Inventory', tick: '04' },
    ],
  },
  {
    group: 'Company',
    items: [
      { to: '/company', label: 'Dashboard', tick: '05', end: true },
      { to: '/company/expenses', label: 'Company expenses', tick: '06' },
    ],
  },
  {
    // Accounts sits under neither, because it is where both sides meet.
    group: 'Money',
    items: [{ to: '/accounts', label: 'Accounts', tick: '07' }],
  },
  {
    group: 'Setup',
    items: [{ to: '/settings', label: 'Settings', tick: '08' }],
  },
]

const PROCUREMENT_NAV = [
  { group: 'Site', items: [{ to: '/', label: 'Material', tick: '00', end: true }] },
]

export default function Layout() {
  const state = useApp()
  const { projects, auth } = state
  const { scope, setScope } = useScope()
  const { pathname } = useLocation()

  // Procurement has one destination and no money, so the rail collapses to it
  // and the top bar loses the project picker and the add buttons entirely.
  const nav = auth.isProcurement ? PROCUREMENT_NAV : NAV

  const onCompany = pathname.startsWith('/company')

  // The project picker is meaningless on pages that carry their own project,
  // and on the company side, where nothing belongs to a project at all.
  const showScope =
    !auth.isProcurement && !onCompany && !pathname.startsWith('/projects/') && pathname !== '/settings'

  // Money in hand rides along on every owner screen. It is the one figure that
  // is true without qualification, and both halves of the app feed it.
  const hand = auth.isProcurement ? null : moneyInHand(state)

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-mark">
          <span className="wordmark">
            <span className="k">K</span>alope
          </span>
          <span className="homes">Homes</span>
          <span className="sub">Finance</span>
        </div>

        <nav className="rail-nav">
          {nav.map((section) => (
            <div key={section.group}>
              <div className="rail-group">{section.group}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `rail-link${isActive ? ' is-active' : ''}`}
                >
                  <span className="tick">{item.tick}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="rail-foot">
          <SyncStatus />
          {auth.user && (
            <div className="rail-user">
              <span title={auth.user.email}>{auth.user.email}</span>
              <button className="btn ghost tiny" onClick={auth.signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        {!auth.isProcurement && (
          <div className="topbar">
            <div>
              <span className="eyebrow">{showScope ? 'Viewing' : 'Money in hand'}</span>
              {showScope ? (
                <h1>
                  {scope === 'all' ? 'All projects' : projects.find((p) => p.id === scope)?.name ?? 'All projects'}
                </h1>
              ) : (
                <h1 className={`figure${hand.total < 0 ? ' neg' : ''}`}>{money(hand.total)}</h1>
              )}
            </div>
            <div className="topbar-spacer" />

            {showScope && (
              <>
                <div className="hand">
                  <span className="eyebrow">In hand</span>
                  <span className={`figure${hand.total < 0 ? ' neg' : ''}`}>{money(hand.total)}</span>
                </div>
                <div className="scope">
                  <span className="eyebrow">Project</span>
                  <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Filter by project">
                    <option value="all">All projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <QuickAdd />
          </div>
        )}

        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
