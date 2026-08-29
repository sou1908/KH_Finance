import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { load, save, newId } from '../data/repo'
import { deleteFiles } from '../data/files'
import { fetchState, getToken, getUser, isCloud, login as apiLogin, logout as apiLogout } from '../data/api'
import { drain, enqueue, status as outboxStatus, subscribe } from '../data/outbox'
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../data/masters'
import { EMPTY, MASTERS, ROLES, WITH_FILES } from './entities'

const AppContext = createContext(null)

// The shape of the ledger lives in its own module so a plain Node test can
// import it. Re-exported here because this is where the rest of the app has
// always reached for it.
export { EMPTY, ENTITIES, LEDGER, MASTERS, WITH_FILES, ROLES } from './entities'

function reducer(state, action) {
  const { type, entity, payload } = action

  switch (type) {
    case 'add':
      return { ...state, [entity]: [...state[entity], payload] }

    case 'update':
      return {
        ...state,
        [entity]: state[entity].map((row) => (row.id === payload.id ? { ...row, ...payload } : row)),
      }

    case 'remove':
      return { ...state, [entity]: state[entity].filter((row) => row.id !== payload.id) }

    case 'removeProject':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== payload.id),
        receipts: state.receipts.filter((r) => r.projectId !== payload.id),
        expenses: state.expenses.filter((e) => e.projectId !== payload.id),
        // Transfers are NOT deleted with the project. The money really did move
        // between accounts; removing the record would leave every balance
        // wrong. The earmark is cleared instead, so the cash history survives
        // without pointing at a project that no longer exists.
        transfers: state.transfers.map((t) =>
          t.projectId === payload.id ? { ...t, projectId: '' } : t,
        ),
      }

    case 'replaceAll':
      return { ...EMPTY, ...payload }

    default:
      return state
  }
}

/**
 * In cloud mode the local copy is a cache, so the app opens instantly and keeps
 * working offline; the server is the source of truth and seeds the masters
 * itself. In local-only mode this is the only copy, so it starts with the same
 * heads and accounts the server would have created — and nothing else.
 *
 * There is deliberately no sample project, client or bill. Invented figures in
 * a ledger are indistinguishable from real ones after a week.
 */
function init() {
  const cached = load()

  // Merged over EMPTY, never returned raw. A cache written before an entity
  // existed has no key for it, so `state.vendors.length` throws for every user
  // who already had a ledger — a crash that only ever hits real installs and
  // never a fresh one. Spreading EMPTY first makes every future entity arrive
  // as an empty list instead of undefined.
  if (cached) return { ...EMPTY, ...cached }

  if (isCloud()) return EMPTY
  return { ...EMPTY, accounts: DEFAULT_ACCOUNTS, categories: DEFAULT_CATEGORIES }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  const [user, setUser] = useState(() => (isCloud() ? getUser() : null))
  const [loading, setLoading] = useState(() => isCloud() && Boolean(getToken()))
  const [loadError, setLoadError] = useState('')
  const [, forceRender] = useState(0)

  const latest = useRef(state)
  latest.current = state

  useEffect(() => save(state), [state])

  // Re-render the sync indicator whenever the queue moves.
  useEffect(() => subscribe(() => forceRender((n) => n + 1)), [])

  const pull = useCallback(async () => {
    if (!isCloud() || !getToken()) return
    setLoading(true)
    setLoadError('')
    try {
      const server = await fetchState()
      dispatch({ type: 'replaceAll', payload: server })
    } catch (err) {
      // Falling back to the cache is right: better a slightly stale ledger than
      // a blank screen, and the queue still holds anything unsent.
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isCloud() && getToken()) {
      pull().then(drain)
    }
  }, [pull])

  const api = useMemo(() => {
    const dropFilesFor = (rows) => deleteFiles(rows.flatMap((r) => r?.attachments ?? []))

    // Every mutation does the same two things: update the screen now, and queue
    // the change for the server.
    const commit = (action, op) => {
      dispatch(action)
      if (op) enqueue(op.type, op.entity, op.payload)
    }

    return {
      add: (entity, row) => {
        const record = { ...row, id: row.id ?? newId(entity.slice(0, 3)) }
        commit({ type: 'add', entity, payload: record }, { type: 'add', entity, payload: record })
        return record
      },

      update: (entity, row) => {
        const before = latest.current[entity]?.find((r) => r.id === row.id)
        const merged = { ...before, ...row }
        const keptIds = new Set((merged.attachments ?? []).map((a) => a.id))
        const orphans = (before?.attachments ?? []).filter((a) => !keptIds.has(a.id))
        if (orphans.length) deleteFiles(orphans)
        commit({ type: 'update', entity, payload: merged }, { type: 'update', entity, payload: merged })
      },

      remove: (entity, id) => {
        const row = latest.current[entity]?.find((r) => r.id === id)
        if (row) dropFilesFor([row])
        commit({ type: 'remove', entity, payload: { id } }, { type: 'remove', entity, payload: { id } })
      },

      removeProject: (id) => {
        const s = latest.current
        dropFilesFor([
          s.projects.find((p) => p.id === id),
          ...s.receipts.filter((r) => r.projectId === id),
          ...s.expenses.filter((e) => e.projectId === id),
        ])
        commit({ type: 'removeProject', payload: { id } }, { type: 'removeProject', entity: 'projects', payload: { id } })
      },

      clearAll: () => {
        const s = latest.current
        // Every kind of row that can hold a file. Missing one leaves its blobs
        // in IndexedDB with nothing left pointing at them.
        dropFilesFor(WITH_FILES.flatMap((entity) => s[entity] ?? []))

        // The ledger goes; the setup stays. Accounts and heads are how the firm
        // has chosen to organise itself, not a record of anything, and clearing
        // them leaves nowhere to file the next bill.
        const next = { ...EMPTY, ...Object.fromEntries(MASTERS.map((entity) => [entity, s[entity] ?? []])) }
        commit({ type: 'replaceAll', payload: next }, { type: 'replaceAll', entity: 'all', payload: next })
      },

      importAll: (data) => {
        const merged = { ...EMPTY, ...data }
        commit({ type: 'replaceAll', payload: merged }, { type: 'replaceAll', entity: 'all', payload: merged })
      },
    }
  }, [])

  const auth = useMemo(
    () => ({
      user,
      isCloud: isCloud(),
      // Convenience for the shell. The server is what actually enforces this;
      // these only decide what to bother rendering.
      role: user?.role ?? ROLES.OWNER,
      isOwner: (user?.role ?? ROLES.OWNER) === ROLES.OWNER,
      isProcurement: user?.role === ROLES.PROCUREMENT,
      signIn: async (email, password) => {
        const signedIn = await apiLogin(email, password)
        setUser(signedIn)
        await pull()
        drain()
        return signedIn
      },
      signOut: async () => {
        await apiLogout()
        setUser(null)
        dispatch({ type: 'replaceAll', payload: EMPTY })
      },
      refresh: pull,
    }),
    [user, pull],
  )

  const sync = {
    pending: outboxStatus.pending(),
    syncing: outboxStatus.syncing(),
    error: outboxStatus.lastError,
    lastSyncAt: outboxStatus.lastSyncAt,
    loading,
    loadError,
    retry: drain,
  }

  const value = useMemo(
    () => ({ ...state, ...api, auth, sync }),
    // `sync` is a fresh object each render on purpose — it carries live counters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, api, auth, sync.pending, sync.syncing, sync.error, sync.loading, sync.loadError],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
