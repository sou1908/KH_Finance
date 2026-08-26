import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import Attachments from './Attachments'
import UnitSelect from './UnitSelect'
import { useApp } from '../store/AppStore'
import { newId } from '../data/repo'
import { money, num, today } from '../lib/format'

/**
 * One shop bill, one form.
 *
 * A bill from a hardware shop usually lists several items under the same date,
 * vendor and bill number. So the form splits in two: the bill's details are
 * entered once, and the items below repeat.
 *
 * Each item is saved as its OWN expense row rather than as lines nested inside
 * one. An expense row already is a line item — it carries quantity, unit, rate
 * and how much has been used on site — and inventory, the stock pool and the
 * leftover figures all work per row. Nesting would need a schema change and
 * would break all three, for no gain: three items on one bill genuinely are
 * three things to track.
 */

// Ids are minted up front so a bill photo attached before the form is submitted
// already knows which expense it belongs to.
const blankItem = (unit = '') => ({
  id: newId('exp'),
  description: '',
  qty: 1,
  unit,
  rate: '',
  amount: '',
  usedQty: 0,
})

const blankBill = (projectId) => ({
  projectId: projectId ?? '',
  date: today(),
  categoryId: '',
  accountId: '',
  vendor: '',
  billNo: '',
  attachments: [],
})

/** An existing row is one item; editing never fans out into several. */
function itemsFrom(existing) {
  if (!existing) return [blankItem()]
  return [
    {
      id: existing.id,
      description: existing.description ?? '',
      qty: existing.qty ?? 1,
      unit: existing.unit ?? '',
      rate: existing.rate ?? '',
      amount: existing.amount ?? '',
      usedQty: existing.usedQty ?? 0,
    },
  ]
}

export default function ExpenseDialog({ existing, lockedProject, onClose }) {
  const { projects, accounts, categories, add, update } = useApp()

  const [bill, setBill] = useState(() => ({
    ...blankBill(lockedProject),
    ...(existing
      ? {
          projectId: existing.projectId,
          date: existing.date,
          categoryId: existing.categoryId,
          accountId: existing.accountId,
          vendor: existing.vendor ?? '',
          billNo: existing.billNo ?? '',
          attachments: existing.attachments ?? [],
        }
      : {}),
  }))

  const [items, setItems] = useState(() => itemsFrom(existing))
  const [error, setError] = useState('')

  const category = categories.find((c) => c.id === bill.categoryId)
  const tracksStock = Boolean(category?.tracksInventory)
  const isEdit = Boolean(existing)

  // Named rather than hardcoded, since the heads are editable in Settings.
  const stockHeads = categories.filter((c) => c.tracksInventory).map((c) => c.name)

  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  const setField = (key) => (e) => {
    setError('')
    setBill((b) => ({ ...b, [key]: e.target.value }))
  }

  const pickCategory = (e) => {
    const id = e.target.value
    const next = categories.find((c) => c.id === id)
    const previousDefault = category?.unit ?? ''

    setError('')
    setBill((b) => ({ ...b, categoryId: id }))

    // Refresh the unit on items that are still carrying a default — either
    // blank, or the previous head's. A unit the user typed themselves is left
    // alone. Without the second test, picking Labour and then Sheet leaves
    // plywood measured in "day".
    setItems((list) =>
      list.map((item) =>
        !item.unit || item.unit === previousDefault ? { ...item, unit: next?.unit ?? '' } : item,
      ),
    )
  }

  const setItem = (index, key, value) => {
    setError('')
    setItems((list) =>
      list.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, [key]: value }
        // Quantity × rate keeps the amount honest; typing the amount wins.
        if (key === 'qty' || key === 'rate') {
          const qty = Number(next.qty) || 0
          const rate = Number(next.rate) || 0
          if (qty && rate) next.amount = String(Math.round(qty * rate * 100) / 100)
        }
        return next
      }),
    )
  }

  const addItem = () => {
    setError('')
    setItems((list) => [...list, blankItem(category?.unit ?? '')])
  }

  const removeItem = (index) => {
    setError('')
    setItems((list) => (list.length === 1 ? list : list.filter((_, i) => i !== index)))
  }

  const submit = () => {
    if (!bill.projectId) return setError('Pick the project this bill belongs to.')
    if (!bill.categoryId) return setError('Pick the head this spend falls under.')
    if (!bill.accountId) return setError('Pick which account paid for it.')

    // Every row on screen must be a real item. An unwanted one is removed with
    // its ✕ rather than left blank, so a blank row is a mistake worth naming.
    const badIndex = items.findIndex((item) => !(Number(item.amount) > 0))
    if (badIndex !== -1) {
      return setError(
        items.length === 1
          ? 'Enter an amount greater than zero.'
          : `Item ${badIndex + 1} has no amount. Fill it in, or remove the row.`,
      )
    }

    const records = items.map((item, index) => {
      const qty = Number(item.qty) || 0
      return {
        ...item,
        projectId: bill.projectId,
        date: bill.date,
        categoryId: bill.categoryId,
        accountId: bill.accountId,
        vendor: bill.vendor,
        billNo: bill.billNo,
        amount: Number(item.amount),
        qty,
        rate: Number(item.rate) || 0,
        usedQty: tracksStock ? Math.min(Number(item.usedQty) || 0, qty) : 0,
        // One photo of one bill: it belongs to the first item, and shows up in
        // the project's Documents panel whichever row owns it.
        attachments: index === 0 ? bill.attachments : [],
      }
    })

    if (isEdit) update('expenses', records[0])
    else records.forEach((record) => add('expenses', record))

    onClose()
  }

  return (
    <Dialog
      title={isEdit ? 'Edit expense' : 'Record an expense'}
      subtitle="Money going out — material, labour, transport, or fees."
      onClose={onClose}
      footer={
        <>
          {error ? (
            <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>
          ) : (
            items.length > 1 && (
              <span className="note">
                {items.length} items ·{' '}
                <strong className="figure" style={{ color: 'var(--ember)' }}>
                  {money(total)}
                </strong>
              </span>
            )
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {isEdit ? 'Save changes' : items.length > 1 ? `Record ${items.length} items` : 'Record expense'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <div className="field-row three">
          <Field label="Project">
            <select value={bill.projectId} onChange={setField('projectId')} disabled={Boolean(lockedProject)}>
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Head" hint={items.length > 1 ? 'Applies to every item below' : undefined}>
            <select value={bill.categoryId} onChange={pickCategory}>
              <option value="">Select head</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={bill.date} onChange={setField('date')} />
          </Field>
        </div>

        <div className="field-row three">
          <Field label="Vendor / paid to">
            <input value={bill.vendor} onChange={setField('vendor')} placeholder="e.g. Shree Ply Mart" />
          </Field>
          <Field label="Paid from" hint="Which account the money left">
            <select value={bill.accountId} onChange={setField('accountId')}>
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bill no.">
            <input value={bill.billNo} onChange={setField('billNo')} placeholder="Optional" />
          </Field>
        </div>

        <div className="items">
          <div className="items-head">
            <span className="eyebrow">{isEdit ? 'Item' : 'Items on this bill'}</span>
            {!isEdit && items.length > 1 && (
              <span className="items-total figure">{money(total)}</span>
            )}
          </div>

          {/* The "used on site" box is per item, but it only makes sense for a
              head that buys physical stock. Without this note its absence reads
              as a missing feature rather than as "you have not picked a head". */}
          {!bill.categoryId && (
            <p className="hint-line">
              Pick a head above. Stock-tracked heads — {stockHeads.join(', ') || 'those marked in Settings'} — add a{' '}
              <em>quantity used on site</em> box to every item.
            </p>
          )}

          {bill.categoryId && !tracksStock && (
            <p className="hint-line">
              {category?.name} is not stock-tracked, so there is nothing left over to count. Turn that on in
              Settings if this head buys material.
            </p>
          )}

          {items.map((item, index) => (
            <div className="line-item" key={item.id}>
              {items.length > 1 && (
                <div className="line-item-bar">
                  <span className="line-no">Item {index + 1}</span>
                  <button
                    type="button"
                    className="btn ghost tiny danger"
                    onClick={() => removeItem(index)}
                    aria-label={`Remove item ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              )}

              <Field label="Description">
                <input
                  value={item.description}
                  onChange={(e) => setItem(index, 'description', e.target.value)}
                  placeholder="e.g. 19mm BWP plywood"
                />
              </Field>

              <div className="field-row four">
                <Field label="Quantity">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.qty}
                    onChange={(e) => setItem(index, 'qty', e.target.value)}
                  />
                </Field>
                <Field label="Unit">
                  <UnitSelect
                    value={item.unit}
                    onChange={(unit) => setItem(index, 'unit', unit)}
                    placeholder={category?.unit ? `${category.unit} (head default)` : 'Select a unit'}
                  />
                </Field>
                <Field label="Rate (₹)">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.rate}
                    onChange={(e) => setItem(index, 'rate', e.target.value)}
                  />
                </Field>
                <Field
                  label="Amount (₹)"
                  hint={item.amount ? money(item.amount) : 'From quantity × rate'}
                >
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.amount}
                    onChange={(e) => setItem(index, 'amount', e.target.value)}
                  />
                </Field>
              </div>

              {tracksStock && (
                <Field
                  label="Quantity used on site"
                  hint={`${category.name} is stock-tracked — whatever is left counts as inventory on site.`}
                >
                  <input
                    type="number"
                    min="0"
                    max={item.qty}
                    step="any"
                    value={item.usedQty}
                    onChange={(e) => setItem(index, 'usedQty', e.target.value)}
                  />
                </Field>
              )}
            </div>
          ))}

          {!isEdit && (
            <button type="button" className="btn add-item" onClick={addItem}>
              <span aria-hidden="true">+</span> Add another item
            </button>
          )}
        </div>

        <Attachments
          label="Bill / receipt"
          hint={
            items.length > 1
              ? 'One photo covers the whole bill. It is filed against the first item and appears in the project’s Documents.'
              : 'Photograph the bill on site — images are shrunk automatically before they are uploaded.'
          }
          value={bill.attachments}
          ownerType="expenses"
          ownerId={items[0]?.id}
          onChange={(attachments) => setBill((b) => ({ ...b, attachments }))}
        />
      </div>
    </Dialog>
  )
}
