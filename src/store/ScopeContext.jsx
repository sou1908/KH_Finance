import { createContext, useContext, useMemo, useState } from 'react'

// Which project the ledger pages are filtered to. Kept out of AppStore because
// it's view state, not data — it must never be persisted into the ledger blob.
const ScopeContext = createContext(null)

export function ScopeProvider({ children }) {
  const [scope, setScope] = useState('all')
  const value = useMemo(() => ({ scope, setScope }), [scope])
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useScope() {
  const ctx = useContext(ScopeContext)
  if (!ctx) throw new Error('useScope must be used inside <ScopeProvider>')
  return ctx
}
