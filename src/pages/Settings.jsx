import { useEffect, useRef, useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import MasterDialog from '../components/MasterDialog'
import UsersPanel from '../components/UsersPanel'
import { ENTITIES, WITH_FILES, useApp } from '../store/AppStore'
import { getFile, humanSize, putFile, storageEstimate } from '../data/files'
import { headsOfKind } from '../store/selectors'
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
        // Driven off the store's own entity list, so a backup cannot quietly omit
        // something added later.
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
          <div className="crumb">
            Heads, offices, accounts and clients — change these and the whole app follows.
          </div>
        </div>
      </div>

      <div className="stack">
        <Panel
          title="Project heads"
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
                {headsOfKind(state, 'project').map((c) => {
                  const count = state.expenses.filter((e) => e.categoryId === c.id).length
                  // Items belong to a head. Deleting the head would strand them
                  // where no screen can reach them, since the Items panel only
                  // ever lists a head that still exists.
                  const itemCount = state.items.filter((i) => i.categoryId === c.id).length
                  const blockedBy = count > 0 ? 'bills' : itemCount > 0 ? 'items' : null
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
                            disabled={Boolean(blockedBy)}
                            title={
                              blockedBy === 'bills'
                                ? `${count} bill${count === 1 ? '' : 's'} are filed under this head. Reassign them first.`
                                : blockedBy === 'items'
                                  ? `${itemCount} item${itemCount === 1 ? '' : 's'} belong to this head. Remove them first.`
                                  : 'Remove this head'
                            }
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

        <CompanyHeadsPanel state={state} setDialog={setDialog} />
        <OfficesPanel state={state} setDialog={setDialog} />

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
                    state.companyExpenses.filter((e) => e.accountId === a.id).length +
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

        <Panel
          title="Vendors"
          action={
            <button className="btn tiny" onClick={() => setDialog({ kind: 'vendor' })}>
              Add vendor
            </button>
          }
          flush
        >
          {state.vendors.length === 0 ? (
            <Empty
              title="No vendors saved yet"
              action={
                <button className="btn primary" onClick={() => setDialog({ kind: 'vendor' })}>
                  Add your first vendor
                </button>
              }
            >
              Save the shops and contractors you buy from and their names become a dropdown when recording a bill —
              typed once, spelled the same way every time.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th className="col-optional">Phone</th>
                    <th className="col-optional">Note</th>
                    <th className="right">Bills</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.vendors.map((v) => {
                    // Bills store the vendor's name, so this counts by name.
                    const count = state.expenses.filter((e) => e.vendor === v.name).length
                    return (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 500 }}>{v.name}</td>
                        <td className="num col-optional">{v.phone || '—'}</td>
                        <td className="note col-optional">{v.note || '—'}</td>
                        <td className="amount">{count}</td>
                        <td>
                          <div className="row-actions">
                            <button className="btn ghost tiny" onClick={() => setDialog({ kind: 'vendor', row: v })}>
                              Edit
                            </button>
                            <button
                              className="btn ghost tiny danger"
                              title="Removing a vendor leaves past bills untouched"
                              onClick={() =>
                                window.confirm(
                                  `Remove ${v.name} from the list?\n\nBills already recorded against them are not affected.`,
                                ) && state.remove('vendors', v.id)
                              }
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
          )}
        </Panel>

        <ItemsPanel state={state} setDialog={setDialog} />

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
      </div>

      {dialog && (
        <MasterDialog
          kind={dialog.kind}
          row={dialog.row}
          presets={dialog.presets}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

/**
 * Heads for the company side, kept in a panel of their own.
 *
 * Same table as the project heads, deliberately a separate list on screen. One
 * combined list would put "Rent" in the dropdown on a client's bill and
 * "Plywood" in the dropdown on a power bill, and the split is the only thing
 * keeping company costs out of project figures.
 */
function CompanyHeadsPanel({ state, setDialog }) {
  const heads = headsOfKind(state, 'company')

  return (
    <Panel
      title="Company heads"
      action={
        <button className="btn tiny" onClick={() => setDialog({ kind: 'companyHead' })}>
          Add company head
        </button>
      }
      flush
    >
      {heads.length === 0 ? (
        <Empty
          title="No company heads yet"
          action={
            <button className="btn primary" onClick={() => setDialog({ kind: 'companyHead' })}>
              Add the first one
            </button>
          }
        >
          These are what the business costs to run — rent, electricity, internet, marketing. The test: if you would
          still pay it with no jobs running, it belongs here rather than under a project head.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Head</th>
                <th className="right">Bills filed</th>
                <th className="right col-optional">Total spent</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {heads.map((c) => {
                const rows = state.companyExpenses.filter((e) => e.categoryId === c.id)
                const spent = rows.reduce((t, e) => t + (Number(e.amount) || 0), 0)
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td className="amount">{rows.length}</td>
                    <td className="amount col-optional">{spent ? money(spent) : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost tiny" onClick={() => setDialog({ kind: 'companyHead', row: c })}>
                          Edit
                        </button>
                        <button
                          className="btn ghost tiny danger"
                          disabled={rows.length > 0}
                          title={
                            rows.length > 0
                              ? `${rows.length} bill${rows.length === 1 ? '' : 's'} are filed under this head. Reassign them first.`
                              : 'Remove this head'
                          }
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
      )}
    </Panel>
  )
}

/**
 * Offices, so two premises can be compared against each other.
 *
 * Nothing is seeded here. An invented office name would be indistinguishable
 * from a real one after a week, and a cost filed against the wrong premises is
 * worse than one filed against none.
 */
function OfficesPanel({ state, setDialog }) {
  return (
    <Panel
      title="Offices"
      action={
        <button className="btn tiny" onClick={() => setDialog({ kind: 'office' })}>
          Add office
        </button>
      }
      flush
    >
      {state.offices.length === 0 ? (
        <Empty
          title="No offices set up"
          action={
            <button className="btn primary" onClick={() => setDialog({ kind: 'office' })}>
              Add your first office
            </button>
          }
        >
          Add each premises and every company bill can be charged to one, so you can see what each is costing you.
          Costs that belong to no single office — an ad campaign, a software licence — stay marked company-wide.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Office</th>
                <th className="col-optional">Address</th>
                <th className="right">Bills filed</th>
                <th className="right col-optional">Total spent</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.offices.map((o) => {
                const rows = state.companyExpenses.filter((e) => e.officeId === o.id)
                const spent = rows.reduce((t, e) => t + (Number(e.amount) || 0), 0)
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500 }}>{o.name}</td>
                    <td className="note col-optional">{o.address || '—'}</td>
                    <td className="amount">{rows.length}</td>
                    <td className="amount col-optional">{spent ? money(spent) : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost tiny" onClick={() => setDialog({ kind: 'office', row: o })}>
                          Edit
                        </button>
                        <button
                          className="btn ghost tiny danger"
                          disabled={rows.length > 0}
                          title={
                            rows.length > 0
                              ? `${rows.length} bill${rows.length === 1 ? '' : 's'} are charged to this office. Reassign them first.`
                              : 'Remove this office'
                          }
                          onClick={() => state.remove('offices', o.id)}
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
      )}
    </Panel>
  )
}

/**
 * Items, one head at a time.
 *
 * Choosing the head first is not decoration: an item only means something under
 * a head — "19mm ply" is Sheet, "hinges" is Hardware — and a flat list of every
 * item across every head would be the thing nobody scrolls through. It also
 * means adding one needs no second choice, because the head is already picked.
 */
function ItemsPanel({ state, setDialog }) {
  const [headId, setHeadId] = useState('')

  // Project heads only — an item is a thing bought for a job, and nothing is
  // ever picked from a list when recording the electricity bill.
  const heads = headsOfKind(state, 'project')
  const head = heads.find((c) => c.id === headId)
  const items = state.items.filter((i) => i.categoryId === headId)
  const countFor = (id) => state.items.filter((i) => i.categoryId === id).length

  return (
    <Panel
      title="Items you buy"
      action={
        <button className="btn tiny" disabled={!headId} onClick={() => setDialog({ kind: 'item', presets: { categoryId: headId, unit: head?.unit ?? '' } })}>
          Add item
        </button>
      }
      flush
    >
      <div style={{ padding: '14px 18px' }}>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="items-head">Head</label>
          <select id="items-head" value={headId} onChange={(e) => setHeadId(e.target.value)}>
            <option value="">Choose a head to see its items</option>
            {heads.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({countFor(c.id)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {!headId ? (
        <Empty title="Pick a head first">
          Items belong to a head — plywood under Sheet, hinges under Hardware. Choose one above and its items
          appear here, ready to be picked from a dropdown when recording a bill.
        </Empty>
      ) : items.length === 0 ? (
        <Empty
          title={`No items under ${head?.name} yet`}
          action={
            <button
              className="btn primary"
              onClick={() => setDialog({ kind: 'item', presets: { categoryId: headId, unit: head?.unit ?? '' } })}
            >
              Add the first item
            </button>
          }
        >
          Add the things you buy under this head. Each one remembers its unit and usual rate, so recording a bill
          becomes picking from a list instead of typing it out.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit</th>
                <th className="right">Usual rate</th>
                <th className="col-optional">Note</th>
                <th className="right">Times bought</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                // Bills record the name, so past use is counted by name.
                const used = state.expenses.filter((e) => e.description === i.name).length
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500 }}>{i.name}</td>
                    <td className="note">{i.unit || '—'}</td>
                    <td className="amount">{Number(i.rate) ? money(i.rate) : '—'}</td>
                    <td className="note col-optional">{i.note || '—'}</td>
                    <td className="amount">{used}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost tiny" onClick={() => setDialog({ kind: 'item', row: i })}>
                          Edit
                        </button>
                        <button
                          className="btn ghost tiny danger"
                          title="Removing an item leaves past bills untouched"
                          onClick={() =>
                            window.confirm(
                              `Remove "${i.name}" from the list?\n\nBills already recorded with it are not affected.`,
                            ) && state.remove('items', i.id)
                          }
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
      )}
    </Panel>
  )
}
