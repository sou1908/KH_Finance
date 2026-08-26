import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import UnitSelect from './UnitSelect'
import { useApp } from '../store/AppStore'
import { ACCOUNT_KINDS } from '../data/masters'
import { money } from '../lib/format'

const DEFAULTS = {
  category: { name: '', unit: '', tracksInventory: false },
  account: { name: '', kind: ACCOUNT_KINDS.CASH, holder: '', openingBalance: 0 },
  client: { name: '', phone: '', note: '' },
}

const ENTITY = { category: 'categories', account: 'accounts', client: 'clients' }
const NOUN = { category: 'head', account: 'account', client: 'client' }

/**
 * Edits the three master lists. Shared by Settings and the Accounts page so
 * there is exactly one form per record type, not one per screen.
 */
export default function MasterDialog({ kind, row, onClose }) {
  const { add, update, accounts } = useApp()
  const [form, setForm] = useState(row ?? DEFAULTS[kind])
  const [error, setError] = useState('')

  const entity = ENTITY[kind]
  const noun = NOUN[kind]

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  // Account types are suggestions, not a locked list — a firm may want "Partner"
  // or "Loan". Only 'personal' carries behaviour (it drives the settlement
  // warning), so anything else is safe to invent.
  const knownKinds = [...new Set([...Object.values(ACCOUNT_KINDS), ...accounts.map((a) => a.kind)])].filter(Boolean)

  const submit = () => {
    if (!String(form.name).trim()) return setError(`Give the ${noun} a name.`)

    const record = { ...form, name: String(form.name).trim() }
    if (kind === 'account') {
      record.openingBalance = Number(form.openingBalance) || 0
      record.kind = String(form.kind || 'cash').trim().toLowerCase()
    }

    if (row) update(entity, record)
    else add(entity, record)
    onClose()
  }

  return (
    <Dialog
      title={`${row ? 'Edit' : 'Add'} ${noun}`}
      subtitle={
        kind === 'account'
          ? 'Every receipt and every bill is filed against one of these.'
          : undefined
      }
      onClose={onClose}
      footer={
        <>
          {error && <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            Save
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <Field
          label="Name"
          hint={kind === 'account' ? 'What you call it day to day — "Cash", "SBI Current", "Personal — A".' : undefined}
        >
          <input value={form.name} onChange={set('name')} autoFocus />
        </Field>

        {kind === 'category' && (
          <>
            <Field label="Default unit" hint="Prefills the unit when recording a bill under this head">
              <UnitSelect value={form.unit} onChange={(unit) => setForm((f) => ({ ...f, unit }))} />
            </Field>
            <Field label="Stock tracking" hint="Tick this for heads that buy physical material you may have left over">
              <label className="note" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={Boolean(form.tracksInventory)} onChange={set('tracksInventory')} />
                Count leftovers as inventory
              </label>
            </Field>
          </>
        )}

        {kind === 'account' && (
          <>
            <div className="field-row">
              <Field label="Type" hint="Pick one or type your own">
                <input
                  list="account-kinds"
                  value={form.kind}
                  onChange={set('kind')}
                  placeholder="cash, personal, company…"
                />
                <datalist id="account-kinds">
                  {knownKinds.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </Field>
              <Field label="Holder" hint="Whose account it is">
                <input value={form.holder} onChange={set('holder')} placeholder="e.g. Kalope Homes" />
              </Field>
            </div>

            <Field
              label="Opening balance (₹)"
              hint={
                Number(form.openingBalance)
                  ? `${money(form.openingBalance)} already in this account before the app started tracking it.`
                  : 'What was already in this account before you started using the app. Leave at 0 if unsure.'
              }
            >
              <input type="number" step="1" value={form.openingBalance} onChange={set('openingBalance')} />
            </Field>
          </>
        )}

        {kind === 'client' && (
          <div className="field-row">
            <Field label="Phone">
              <input value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Note">
              <input value={form.note} onChange={set('note')} placeholder="Address, referral, anything" />
            </Field>
          </div>
        )}
      </div>
    </Dialog>
  )
}
