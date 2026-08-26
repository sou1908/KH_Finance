import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
import MasterDialog from '../components/MasterDialog'
import { useApp } from '../store/AppStore'
import { getFile, humanSize, putFile, storageEstimate } from '../data/files'
import { money } from '../lib/format'

/**
 * Masters live here so the firm can change its own chart of accounts and heads
 * without a deploy. Everything on this page is data the rest of the app reads.
 */
export default function Settings() {
  const state = useApp()
  const [dialog, setDialog] = useState(null)
  const fileRef = useRef(null)

  const [busy, setBusy] = useState('')
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    storageEstimate().then(setUsage).catch(() => {})
  }, [state.expenses, state.receipts])

  const allAttachments = [...state.projects, ...state.receipts, ...state.expenses].flatMap(
    (row) => row.attachments ?? [],
  )

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })

  // A backup that dropped bill photos would be worse than no backup, so the
  // files ride along base64-encoded inside the same JSON.
  const exportBackup = async () => {
    setBusy('Packing backup…')
    try {
      const files = {}
      for (const meta of allAttachments) {
        const blob = await getFile(meta.id)
        if (blob) files[meta.id] = await blobToDataUrl(blob)
      }

      const payload = {
        format: 'kalope-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        accounts: state.accounts,
        categories: state.categories,
        clients: state.clients,
        projects: state.projects,
        receipts: state.receipts,
        expenses: state.expenses,
        files,
      }

      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kalope-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      window.alert(`Backup failed — ${err.message}.`)
    } finally {
      setBusy('')
    }
  }

  /**
   * The only destructive button left. It names what is about to go, because
   * "delete everything?" is easy to click past when the answer feels obvious
   * and the ledger has a year of work in it.
   */
  const eraseEverything = () => {
    const counts = [
      [state.projects.length, 'project'],
      [state.receipts.length, 'receipt'],
      [state.expenses.length, 'expense'],
      [state.transfers.length, 'transfer'],
      [allAttachments.length, 'attached file'],
    ]
      .filter(([n]) => n > 0)
      .map(([n, noun]) => `${n} ${noun}${n === 1 ? '' : 's'}`)

    if (counts.length === 0) {
      window.alert('There is nothing to erase yet.')
      return
    }

    if (!window.confirm(`Erase ${counts.join(', ')}?\n\nTake a backup first if you are not certain.`)) return
    if (!window.confirm('Last check — this clears the ledger. Continue?')) return

    state.clearAll()
  }

  const importBackup = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        if (!Array.isArray(data.projects)) throw new Error('no project list found in it')
        if (!window.confirm('Replace everything currently in this browser with the backup?')) return

        setBusy('Restoring…')
        for (const [id, dataUrl] of Object.entries(data.files ?? {})) {
          const blob = await (await fetch(dataUrl)).blob()
          await putFile(id, blob)
        }
        state.importAll(data)
      } catch (err) {
        window.alert(`That file could not be read as a Kalope Homes backup — ${err.message}.`)
      } finally {
        setBusy('')
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Setup</span>
          <h1>Settings</h1>
          <div className="crumb">Heads, accounts and clients — change these and the whole app follows.</div>
        </div>
      </div>

      <div className="stack">
        <Panel
          title="Expenditure heads"
          action={
            <button className="btn tiny" onClick={() => setDialog({ kind: 'category' })}>
              Add head
            </button>
          }
          flush
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Head</th>
                  <th>Default unit</th>
                  <th>Stock tracked</th>
                  <th className="right">Bills filed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.categories.map((c) => {
                  const count = state.expenses.filter((e) => e.categoryId === c.id).length
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td className="note">{c.unit || '—'}</td>
                      <td>
                        {c.tracksInventory ? (
                          <span className="chip ok">Counts toward inventory</span>
                        ) : (
                          <span className="chip">Service / one-off</span>
                        )}
                      </td>
                      <td className="amount">{count}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost tiny" onClick={() => setDialog({ kind: 'category', row: c })}>
                            Edit
                          </button>
                          <button
                            className="btn ghost tiny danger"
                            disabled={count > 0}
                            title={count > 0 ? 'Reassign its bills before deleting' : ''}
                            onClick={() => state.remove('categories', c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Accounts"
          action={
            <button className="btn tiny" onClick={() => setDialog({ kind: 'account' })}>
              Add account
            </button>
          }
          flush
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Holder</th>
                  <th className="right">Opening balance</th>
                  <th className="right">Movements</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((a) => {
                  const count =
                    state.expenses.filter((e) => e.accountId === a.id).length +
                    state.receipts.filter((r) => r.accountId === a.id).length
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>{a.name}</td>
                      <td>
                        <span className="chip">{a.kind}</span>
                      </td>
                      <td className="note">{a.holder || '—'}</td>
                      <td className="amount">{money(a.openingBalance)}</td>
                      <td className="amount">{count}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost tiny" onClick={() => setDialog({ kind: 'account', row: a })}>
                            Edit
                          </button>
                          <button
                            className="btn ghost tiny danger"
                            disabled={count > 0}
                            title={count > 0 ? 'Reassign its entries before deleting' : ''}
                            onClick={() => state.remove('accounts', a.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Clients"
          action={
            <button className="btn tiny" onClick={() => setDialog({ kind: 'client' })}>
              Add client
            </button>
          }
          flush
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Phone</th>
                  <th>Note</th>
                  <th className="right">Projects</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.clients.map((c) => {
                  const count = state.projects.filter((p) => p.clientId === c.id).length
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td className="num">{c.phone || '—'}</td>
                      <td className="note">{c.note || '—'}</td>
                      <td className="amount">{count}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost tiny" onClick={() => setDialog({ kind: 'client', row: c })}>
                            Edit
                          </button>
                          <button
                            className="btn ghost tiny danger"
                            disabled={count > 0}
                            onClick={() => state.remove('clients', c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Your data">
          <p className="note" style={{ marginTop: 0 }}>
            v1 keeps everything in this browser only — the ledger in local storage, and{' '}
            <strong>{allAttachments.length}</strong> attached file
            {allAttachments.length === 1 ? '' : 's'} in this browser's database. Nothing leaves this machine, and
            clearing site data wipes both. Take a backup regularly.
            {usage && (
              <>
                {' '}
                Currently using <span className="num">{humanSize(usage.usage)}</span> of roughly{' '}
                <span className="num">{humanSize(usage.quota)}</span> available.
              </>
            )}
          </p>
          <div className="toolbar" style={{ margin: 0 }}>
            <button className="btn" onClick={exportBackup} disabled={Boolean(busy)}>
              {busy === 'Packing backup…' ? busy : 'Download backup'}
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
              {busy === 'Restoring…' ? busy : 'Restore from backup'}
            </button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={importBackup} />
            <div className="spacer" />
            <button className="btn danger" onClick={eraseEverything}>
              Erase everything
            </button>
          </div>
        </Panel>
      </div>

      {dialog && <MasterDialog kind={dialog.kind} row={dialog.row} onClose={() => setDialog(null)} />}
    </>
  )
}
