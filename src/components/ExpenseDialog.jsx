import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import Attachments from './Attachments'
import UnitSelect from './UnitSelect'
import { useApp } from '../store/AppStore'
import { vendorsOfKind } from '../store/selectors'
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
// Sentinels for the "not on the list" option in each dropdown.
const NEW_VENDOR = '__new_vendor'
const NEW_ITEM = '__new_item'

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
  const state = useApp()
  const { projects, accounts, categories, items: savedItems, add, update } = state

  // Only the shops and contractors kept for jobs. The landlord belongs on the
  // company side and must never be offerable on a client's bill.
  const vendors = vendorsOfKind(state, 'project')

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

  // An existing bill may name a vendor that was never added to the list; it
  // must stay editable rather than being silently blanked.
  const [typingVendor, setTypingVendor] = useState(
    () => Boolean(existing?.vendor) && !(vendors ?? []).some((v) => v.name === existing.vendor),
  )

  // A client's bill can only carry a project head. Office rent must never be
  // offerable here — that is the whole point of the two lists being separate.
  const projectHeads = categories.filter((c) => (c.kind || 'project') === 'project')

  const category = categories.find((c) => c.id === bill.categoryId)
  const tracksStock = Boolean(category?.tracksInventory)
  const isEdit = Boolean(existing)

  // Named rather than hardcoded, since the heads are editable in Settings.
  const stockHeads = projectHeads.filter((c) => c.tracksInventory).map((c) => c.name)

  // The saved items for whichever head is selected.
  const headItems = (savedItems ?? []).filter((i) => i.categoryId === bill.categoryId)

  /**
   * Whether a line shows a text box rather than the dropdown.
   *
   * Decided per render rather than held in state, because a description can
   * stop matching the list without anything being typed: editing a bill from
   * before the list existed, or switching the head after picking an item. A
   * select whose value is not among its options renders blank — the text is
   * still there and still saves, but it is invisible and cannot be corrected,
   * which is the worst of both.
   */
  const showsTextFor = (item) =>
    Boolean(item.typing) ||
    headItems.length === 0 ||
    (Boolean(item.description) && !headItems.some((saved) => saved.name === item.description))

  /**
   * Choosing a saved item fills in what is known about it.
   *
   * The rate is a starting point, not a rule — prices move, and the bill in
   * hand is the truth. It only fills a rate that has not been typed, so
   * changing the item on a line never quietly overwrites a figure read off the
   * paper.
   */
  const pickItem = (index, name) => {
    if (name === NEW_ITEM) {
      setItems((list) => list.map((it, i) => (i === index ? { ...it, typing: true, description: '' } : it)))
      return
    }

    const saved = headItems.find((i) => i.name === name)
    setError('')

    setItems((list) =>
      list.map((it, i) => {
        if (i !== index) return it

        const next = { ...it, description: name }
        if (!saved) return next

        if (saved.unit) next.unit = saved.unit

        // Only fill a rate that has not been entered, and only recompute the
        // amount when this actually supplied the rate. Recomputing regardless
        // would undo a discount typed straight into the amount box — the one
        // figure on the line that was read off the paper.
        const fillsRate = Number(saved.rate) > 0 && !Number(it.rate)
        if (fillsRate) {
          next.rate = String(saved.rate)
          const qty = Number(next.qty) || 0
          if (qty) next.amount = String(Math.round(qty * Number(saved.rate) * 100) / 100)
        }

        return next
      }),
    )
  }

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
      // `typing` is form state — which control the row is showing — and has no
      // business being written to the ledger.
      const { typing, ...fields } = item
      return {
        ...fields,
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
              {projectHeads.map((c) => (
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
          <Field
            label="Vendor / paid to"
            hint={vendors.length === 0 ? 'Save vendors in Settings to pick them here' : undefined}
          >
            {/* Falls back to a text box when there is no list to pick from, so
                a fresh install does not make you visit Settings before you can
                record your first bill. Same rule as the description field. */}
            {typingVendor || vendors.length === 0 ? (
              <div className="unit-custom">
                <input
                  value={bill.vendor}
                  onChange={setField('vendor')}
                  placeholder="e.g. Shree Ply Mart"
                  autoFocus
                />
                {vendors.length > 0 && (
                  <button
                    type="button"
                    className="btn ghost tiny"
                    onClick={() => {
                      setTypingVendor(false)
                      setBill((b) => ({ ...b, vendor: '' }))
                    }}
                  >
                    Use the list
                  </button>
                )}
              </div>
            ) : (
              <select
                value={bill.vendor}
                onChange={(e) => {
                  if (e.target.value === NEW_VENDOR) {
                    setTypingVendor(true)
                    setBill((b) => ({ ...b, vendor: '' }))
                    return
                  }
                  setField('vendor')(e)
                }}
              >
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.name}>
                    {v.name}
                  </option>
                ))}
                <option value={NEW_VENDOR}>+ Someone not on the list…</option>
              </select>
            )}
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

              <Field
                label="Description"
                hint={
                  bill.categoryId && headItems.length === 0
                    ? `No items saved under ${category?.name}. Add them in Settings and they appear here.`
                    : undefined
                }
              >
                {/* Picked from the head's saved items, so the same thing is
                    named the same way every time — which is what lets the stock
                    pool add it up. Free text stays available for a one-off. */}
                {showsTextFor(item) ? (
                  <div className="unit-custom">
                    <input
                      value={item.description}
                      onChange={(e) => setItem(index, 'description', e.target.value)}
                      placeholder="e.g. 19mm BWP plywood"
                    />
                    {headItems.length > 0 && (
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={() => setItems((l) => l.map((it, i) => (i === index ? { ...it, typing: false, description: '' } : it)))}
                      >
                        Use the list
                      </button>
                    )}
                  </div>
                ) : (
                  <select value={item.description} onChange={(e) => pickItem(index, e.target.value)}>
                    <option value="">Select an item</option>
                    {headItems.map((saved) => (
                      <option key={saved.id} value={saved.name}>
                        {saved.name}
                        {Number(saved.rate) ? ` — ${money(saved.rate)}/${saved.unit || 'unit'}` : ''}
                      </option>
                    ))}
                    <option value={NEW_ITEM}>+ Something not on the list…</option>
                  </select>
                )}
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
