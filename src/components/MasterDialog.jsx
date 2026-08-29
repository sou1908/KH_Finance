import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import UnitSelect from './UnitSelect'
import { useApp } from '../store/AppStore'
import { ACCOUNT_KINDS } from '../data/masters'
import { money } from '../lib/format'

const DEFAULTS = {
  category: { name: '', unit: '', tracksInventory: false, kind: 'project' },
  // Same table, same form — only the side it lands on differs.
  companyHead: { name: '', unit: '', tracksInventory: false, kind: 'company' },
  account: { name: '', kind: ACCOUNT_KINDS.CASH, holder: '', openingBalance: 0 },
  client: { name: '', phone: '', note: '' },
  vendor: { name: '', phone: '', note: '', kind: 'project' },
  // Same table as vendors — a landlord and a plywood shop are both someone you
  // pay — but kept as separate lists so neither appears on the other's bill.
  companyVendor: { name: '', phone: '', note: '', kind: 'company' },
  item: { name: '', categoryId: '', unit: '', rate: '', note: '' },
  office: { name: '', address: '', note: '' },
}

const ENTITY = {
  category: 'categories',
  companyHead: 'categories',
  account: 'accounts',
  client: 'clients',
  vendor: 'vendors',
  companyVendor: 'vendors',
  item: 'items',
  office: 'offices',
}

const NOUN = {
  category: 'head',
  companyHead: 'company head',
  account: 'account',
  client: 'client',
  vendor: 'vendor',
  companyVendor: 'company vendor',
  item: 'item',
  office: 'office',
}

/**
 * Edits every master list. Shared by Settings and the Accounts page so there is
 * exactly one form per record type, not one per screen.
 *
 * `presets` seeds a new record — the Items panel passes the head that is
 * currently selected, so adding an item under it needs no extra choosing.
 */
export default function MasterDialog({ kind, row, presets, onClose }) {
  const { add, update, accounts, categories } = useApp()
  const [form, setForm] = useState(row ?? { ...DEFAULTS[kind], ...presets })
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

    // Which side of the app a head belongs to is set by which panel opened this
    // form, never by the form itself. An editable dropdown here would let a
    // head be flipped after bills are already filed under it.
    if (kind === 'category' || kind === 'vendor') record.kind = 'project'
    if (kind === 'companyHead' || kind === 'companyVendor') record.kind = 'company'

    if (kind === 'account') {
      record.openingBalance = Number(form.openingBalance) || 0
      record.kind = String(form.kind || 'cash').trim().toLowerCase()
    }

    if (kind === 'item') {
      if (!form.categoryId) return setError('Pick the head this item belongs to.')
      record.rate = Number(form.rate) || 0
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
          : kind === 'companyHead'
            ? 'For costs the business carries whether or not any job is running.'
            : kind === 'companyVendor'
              ? 'Landlords, the power company, agencies — whoever the business pays to keep running.'
              : kind === 'office'
                ? 'Somewhere costs are incurred, so you can compare one against another.'
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
          hint={
            kind === 'account'
              ? 'What you call it day to day — "Cash", "SBI Current", "Personal — A".'
              : kind === 'companyHead'
                ? 'What the money went on — "Rent", "Electricity", "Marketing".'
                : kind === 'office'
                  ? 'What you call the place — "Andheri office", "Main office".'
                  : undefined
          }
        >
          <input value={form.name} onChange={set('name')} autoFocus />
        </Field>

        {kind === 'office' && (
          <>
            <Field label="Address">
              <input value={form.address} onChange={set('address')} placeholder="Optional" />
            </Field>
            <Field label="Note">
              <input value={form.note} onChange={set('note')} placeholder="Which team sits here, anything worth knowing" />
            </Field>
          </>
        )}

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

        {(kind === 'client' || kind === 'vendor' || kind === 'companyVendor') && (
          <div className="field-row">
            <Field label="Phone">
              <input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Note">
              <input
                value={form.note}
                onChange={set('note')}
                placeholder={
                  kind === 'vendor'
                    ? 'Shop address, contact person'
                    : kind === 'companyVendor'
                      ? 'Account number, which office, contact person'
                      : 'Address, referral, anything'
                }
              />
            </Field>
          </div>
        )}

        {kind === 'item' && (
          <>
            <Field label="Head" hint="Which head this item is bought under">
              <select value={form.categoryId} onChange={set('categoryId')}>
                <option value="">Select head</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="field-row">
              <Field label="Unit" hint="Prefilled when this item is picked on a bill">
                <UnitSelect value={form.unit} onChange={(unit) => setForm((f) => ({ ...f, unit }))} />
              </Field>
              <Field
                label="Usual rate (₹)"
                hint={
                  Number(form.rate)
                    ? `${money(form.rate)} — a starting point, always editable on the bill`
                    : 'Optional. Prefilled on a bill, and still editable there.'
                }
              >
                <input type="number" min="0" step="any" value={form.rate} onChange={set('rate')} />
              </Field>
            </div>

            <Field label="Note">
              <input value={form.note} onChange={set('note')} placeholder="Brand, size, specification" />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  )
}
