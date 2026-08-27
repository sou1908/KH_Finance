import { NavLink, Outlet, useLocation } from 'react-router-dom'
import QuickAdd from './QuickAdd'
import SyncStatus from './SyncStatus'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'

const NAV = [
  {
    group: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', tick: '00', end: true },
      { to: '/projects', label: 'Projects', tick: '01' },
    ],
  },
  {
    group: 'Ledger',
    items: [
      { to: '/incoming', label: 'Incoming', tick: '02' },
      { to: '/expenses', label: 'Expenditure', tick: '03' },
      { to: '/accounts', label: 'Accounts', tick: '04' },
      { to: '/inventory', label: 'Inventory', tick: '05' },
    ],
  },
  {
    group: 'Setup',
    items: [{ to: '/settings', label: 'Settings', tick: '06' }],
  },
]

const PROCUREMENT_NAV = [
  { group: 'Site', items: [{ to: '/', label: 'Material', tick: '00', end: true }] },
]

export default function Layout() {
  const { projects, auth } = useApp()
  const { scope, setScope } = useScope()
  const { pathname } = useLocation()

  // Procurement has one destination and no money, so the rail collapses to it
  // and the top bar loses the project picker and the add buttons entirely.
  const nav = auth.isProcurement ? PROCUREMENT_NAV : NAV

  // The project picker is meaningless on pages that carry their own project.
  const showScope = !auth.isProcurement && !pathname.startsWith('/projects/') && pathname !== '/settings'

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-mark">
          <span className="wordmark">
            <span className="k">K</span>alope
          </span>
          <span className="homes">Homes</span>
          <span className="sub">Project Finance</span>
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
        {showScope && (
          <div className="topbar">
            <div>
              <span className="eyebrow">Viewing</span>
              <h1>{scope === 'all' ? 'All projects' : projects.find((p) => p.id === scope)?.name ?? 'All projects'}</h1>
            </div>
            <div className="topbar-spacer" />
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
