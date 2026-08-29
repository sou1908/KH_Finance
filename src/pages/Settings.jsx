import { useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import MasterDialog from '../components/MasterDialog'
import VendorsPanel from '../components/VendorsPanel'
import SharedSetup from '../components/SharedSetup'
import { useApp } from '../store/AppStore'
import { headsOfKind } from '../store/selectors'
import { money } from '../lib/format'

/**
 * Setup for the project side.
 *
 * Masters live here so the firm can change its own heads, items and clients
 * without a deploy. The company side has its own page: keeping one combined
 * list would put "Rent" in the dropdown on a client's bill and "Plywood" in the
 * one on a power bill, and that separation is what keeps the two sets of
 * figures from contaminating each other.
 */
export default function Settings() {
  const state = useApp()
  const [dialog, setDialog] = useState(null)

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Projects · Setup</span>
          <h1>Project settings</h1>
          <div className="crumb">
            Heads, items and clients for the job side. Company heads and payees live under Company settings.
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

        <VendorsPanel state={state} setDialog={setDialog} side="project" />
        <ItemsPanel state={state} setDialog={setDialog} />

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

        <SharedSetup setDialog={setDialog} />
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
        <button
          className="btn tiny"
          disabled={!headId}
          onClick={() => setDialog({ kind: 'item', presets: { categoryId: headId, unit: head?.unit ?? '' } })}
        >
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
