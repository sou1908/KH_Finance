import { useEffect, useRef, useState } from 'react'
import Panel from './Panel'
import UsersPanel from './UsersPanel'
import { ENTITIES, WITH_FILES, useApp } from '../store/AppStore'
import { getFile, humanSize, putFile, storageEstimate } from '../data/files'
import { money } from '../lib/format'

/**
 * The setup that belongs to neither side, shown on both.
 *
 * Accounts, logins and the backup are one set of things, not two. They appear
 * under both Settings pages because hunting for the backup button by first
 * working out which half of the app it lives in would be a worse answer than
 * showing the same panel twice.
 */
export default function SharedSetup({ setDialog }) {
  const state = useApp()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState('')
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    storageEstimate().then(setUsage).catch(() => {})
  }, [state.expenses, state.receipts, state.companyExpenses])

  const allAttachments = WITH_FILES.flatMap((entity) =>
    (state[entity] ?? []).flatMap((row) => row.attachments ?? []),
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
        version: 2,
        exportedAt: new Date().toISOString(),
        // Driven off the store's own entity list, so a backup cannot quietly
        // omit something added later.
        ...Object.fromEntries(ENTITIES.map((entity) => [entity, state[entity] ?? []])),
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
      [state.companyExpenses.length, 'company expense'],
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

  return (
    <>
      <div className="section-rule">
        <span className="eyebrow">Shared — the same on both sides</span>
      </div>

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
                <th className="col-optional">Holder</th>
                <th className="right">Opening balance</th>
                <th className="right">Movements</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.accounts.map((a) => {
                // Both sides leave from these, so both sides count towards
                // whether the account is still in use.
                const count =
                  state.expenses.filter((e) => e.accountId === a.id).length +
                  state.companyExpenses.filter((e) => e.accountId === a.id).length +
                  state.receipts.filter((r) => r.accountId === a.id).length
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td>
                      <span className="chip">{a.kind}</span>
                    </td>
                    <td className="note col-optional">{a.holder || '—'}</td>
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

      <UsersPanel />

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
    </>
  )
}
