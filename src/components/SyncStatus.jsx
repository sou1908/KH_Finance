import { useApp } from '../store/AppStore'

/**
 * Says plainly whether the ledger is safe on the server. Silence here would be
 * worse than useless — somebody needs to know before they close the laptop.
 */
export default function SyncStatus() {
  const { auth, sync } = useApp()

  if (!auth.isCloud) {
    return (
      <span className="sync-pill warn" title="No database is configured — data lives only in this browser.">
        <span className="dot" /> This device only
      </span>
    )
  }

  if (sync.loading) {
    return (
      <span className="sync-pill">
        <span className="dot" /> Loading…
      </span>
    )
  }

  if (sync.pending > 0) {
    return (
      <button
        className="sync-pill pending"
        onClick={sync.retry}
        title={sync.error ?? 'Sending your changes to the server'}
      >
        <span className="dot" /> {sync.syncing ? 'Saving' : 'Waiting to save'} · {sync.pending}
      </button>
    )
  }

  if (sync.error || sync.loadError) {
    return (
      <button className="sync-pill warn" onClick={auth.refresh} title={sync.error ?? sync.loadError}>
        <span className="dot" /> Reconnect
      </button>
    )
  }

  return (
    <span className="sync-pill ok" title={sync.lastSyncAt ? `Last saved ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : 'Everything is on the server'}>
      <span className="dot" /> Saved
    </span>
  )
}
