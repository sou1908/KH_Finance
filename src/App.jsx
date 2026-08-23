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

/** With a database configured, nothing is reachable until someone signs in. */
function Gate({ children }) {
  const { auth } = useApp()
  if (auth.isCloud && !auth.user) return <SignIn />
  return children
}

export default function App() {
  return (
    <AppProvider>
      <Gate>
        <ScopeProvider>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="incoming" element={<Incoming />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </ScopeProvider>
      </Gate>
    </AppProvider>
  )
}
