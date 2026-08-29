import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import QuickAdd from './QuickAdd'
import SyncStatus from './SyncStatus'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'
import { moneyInHand } from '../store/selectors'
import { money } from '../lib/format'

/**
 * The app is two systems, not one with a company section bolted on.
 *
 * Switching sides swaps the whole rail rather than jumping to one page: in
 * Company mode there is no Projects list to wander into, and no client money
 * anywhere. Accounts and Settings appear in both because they genuinely belong
 * to both — the accounts are where the two sides meet, and Settings configures
 * each of them.
 */
const MODES = {
  projects: {
    label: 'Projects',
    home: '/',
    nav: [
      {
        group: 'Jobs',
        items: [
          { to: '/', label: 'Dashboard', tick: '00', end: true },
          { to: '/projects', label: 'Projects', tick: '01' },
          { to: '/incoming', label: 'Incoming', tick: '02' },
          { to: '/expenses', label: 'Expenditure', tick: '03' },
          { to: '/inventory', label: 'Inventory', tick: '04' },
        ],
      },
      { group: 'Money', items: [{ to: '/accounts', label: 'Accounts', tick: '05' }] },
      { group: 'Setup', items: [{ to: '/settings', label: 'Settings', tick: '06' }] },
    ],
  },
  company: {
    label: 'Company',
    home: '/company',
    nav: [
      {
        group: 'Business',
        items: [
          { to: '/company', label: 'Dashboard', tick: '00', end: true },
          { to: '/company/expenses', label: 'Expenses', tick: '01' },
        ],
      },
      { group: 'Money', items: [{ to: '/accounts', label: 'Accounts', tick: '02' }] },
      { group: 'Setup', items: [{ to: '/settings', label: 'Settings', tick: '03' }] },
    ],
  },
}

const PROJECT_PATHS = ['/projects', '/incoming', '/expenses', '/inventory']

/**
 * Which side a path belongs to, or null when it belongs to both.
 *
 * Deriving the mode from the URL rather than storing it is what makes a
 * bookmark, a refresh and the back button all land in the right system.
 * Accounts and Settings answer null, so arriving there keeps whichever side
 * you were already on instead of throwing you back to Projects.
 */
function modeFromPath(pathname) {
  if (pathname.startsWith('/company')) return 'company'
  if (pathname === '/' || PROJECT_PATHS.some((p) => pathname.startsWith(p))) return 'projects'
  return null
}

const MODE_KEY = 'kalope.mode'

const rememberedMode = () => {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    return saved in MODES ? saved : null
  } catch {
    return null
  }
}

const PROCUREMENT_NAV = [
  { group: 'Site', items: [{ to: '/', label: 'Material', tick: '00', end: true }] },
]

export default function Layout() {
  const state = useApp()
  const { projects, auth } = state
  const { scope, setScope } = useScope()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // The URL decides the side wherever it can; the remembered choice only fills
  // in on Accounts and Settings, which belong to both.
  const [mode, setMode] = useState(() => modeFromPath(pathname) ?? rememberedMode() ?? 'projects')

  const routeMode = modeFromPath(pathname)
  useEffect(() => {
    if (routeMode && routeMode !== mode) setMode(routeMode)
  }, [routeMode, mode])

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      // A browser refusing storage is not a reason to break the shell.
    }
  }, [mode])

  const switchTo = (next) => {
    setMode(next)
    navigate(MODES[next].home)
  }

  // Procurement has one destination and no money, so the rail collapses to it
  // and the top bar loses the project picker and the add buttons entirely.
  const nav = auth.isProcurement ? PROCUREMENT_NAV : MODES[mode].nav

  const onCompany = mode === 'company'

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

        {/* The two sides of the business. Switching swaps the rail below it,
            so each is a whole system rather than a page you visit. */}
        {!auth.isProcurement && (
          <div className="rail-switch" role="group" aria-label="Switch between projects and company">
            {Object.entries(MODES).map(([key, m]) => (
              <button
                key={key}
                type="button"
                className={`rail-switch-btn is-${key}${mode === key ? ' is-active' : ''}`}
                aria-pressed={mode === key}
                onClick={() => switchTo(key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

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
