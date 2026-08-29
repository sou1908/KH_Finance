import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import SignIn from './components/SignIn'
import { AppProvider, useApp } from './store/AppStore'
import { ScopeProvider } from './store/ScopeContext'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Incoming from './pages/Incoming'
import Expenses from './pages/Expenses'
import Accounts from './pages/Accounts'
import Inventory from './pages/Inventory'
import Settings from './pages/Settings'
import Procurement from './pages/Procurement'
import Company from './pages/Company'
import CompanyExpenses from './pages/CompanyExpenses'
import CompanySettings from './pages/CompanySettings'

/** With a database configured, nothing is reachable until someone signs in. */
function Gate({ children }) {
  const { auth } = useApp()
  if (auth.isCloud && !auth.user) return <SignIn />
  return children
}

/**
 * Procurement gets a different app, not a subset of this one with pieces
 * greyed out. There is no dashboard to reach and no route to guess at, because
 * those routes are not registered for that role at all — and the server would
 * not have sent the figures behind them anyway.
 */
function ProcurementApp() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Procurement />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Gate>
        <ScopeProvider>
          <HashRouter>
            <RoleRoutes />
          </HashRouter>
        </ScopeProvider>
      </Gate>
    </AppProvider>
  )
}

function RoleRoutes() {
  const { auth } = useApp()
  if (auth.isProcurement) return <ProcurementApp />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="incoming" element={<Incoming />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="inventory" element={<Inventory />} />
        {/* The other half of the business: what it costs to run, whatever
            jobs are on. */}
        <Route path="company" element={<Company />} />
        <Route path="company/expenses" element={<CompanyExpenses />} />
        <Route path="company/settings" element={<CompanySettings />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
