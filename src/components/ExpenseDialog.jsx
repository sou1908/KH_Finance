import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import Attachments from './Attachments'
import { useApp } from '../store/AppStore'
import { newId } from '../data/repo'
import { money, today } from '../lib/format'

// The id is minted here rather than on save, so a bill photo attached before
// the form is submitted already knows which expense it belongs to.
const blank = (projectId) => ({
  id: newId('exp'),
  projectId: projectId ?? '',
  date: today(),
  categoryId: '',
  accountId: '',
  vendor: '',
  description: '',
  qty: 1,
  unit: '',
  rate: '',
  amount: '',
  billNo: '',
  usedQty: 0,
  attachments: [],
})

export default function ExpenseDialog({ existing, lockedProject, onClose }) {
  const { projects, accounts, categories, add, update } = useApp()
  const [form, setForm] = useState(() => ({ attachments: [], ...(existing ?? blank(lockedProject)) }))
  const [error, setError] = useState('')

  const category = categories.find((c) => c.id === form.categoryId)
  const tracksStock = Boolean(category?.tracksInventory)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // qty × rate keeps the amount honest; typing the amount directly still wins.
  const setQtyOrRate = (key) => (e) => {
    const value = e.target.value
    setForm((f) => {
      const next = { ...f, [key]: value }
      const qty = Number(next.qty) || 0
      const rate = Number(next.rate) || 0
      if (qty && rate) next.amount = String(Math.round(qty * rate * 100) / 100)
      return next
    })
  }

  const pickCategory = (e) => {
    const id = e.target.value
    const cat = categories.find((c) => c.id === id)
    setForm((f) => ({ ...f, categoryId: id, unit: f.unit || cat?.unit || '' }))
  }

  const submit = () => {
    if (!form.projectId) return setError('Pick the project this bill belongs to.')
    if (!form.categoryId) return setError('Pick the head this spend falls under.')
    if (!form.accountId) return setError('Pick which account paid for it.')
    const amount = Number(form.amount)
    if (!amount || amount <= 0) return setError('Enter an amount greater than zero.')

    const qty = Number(form.qty) || 0
    const record = {
      ...form,
      amount,
      qty,
      rate: Number(form.rate) || 0,
      usedQty: tracksStock ? Math.min(Number(form.usedQty) || 0, qty) : 0,
    }

    if (existing) update('expenses', record)
    else add('expenses', record)
    onClose()
  }

  return (
    <Dialog
      title={existing ? 'Edit expense' : 'Record an expense'}
      subtitle="Money going out — material, labour, transport, or fees."
      onClose={onClose}
      footer={
        <>
          {error && <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Save changes' : 'Record expense'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <div className="field-row three">
          <Field label="Project">
            <select value={form.projectId} onChange={set('projectId')} disabled={Boolean(lockedProject)}>
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Head">
            <select value={form.categoryId} onChange={pickCategory}>
              <option value="">Select head</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={form.date} onChange={set('date')} />
          </Field>
        </div>

        <div className="field-row">
          <Field label="Vendor / paid to">
            <input value={form.vendor} onChange={set('vendor')} placeholder="e.g. Shree Ply Mart" />
          </Field>
          <Field label="Paid from" hint="Which account the money left">
            <select value={form.accountId} onChange={set('accountId')}>
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <input value={form.description} onChange={set('description')} placeholder="e.g. 19mm BWP plywood" />
        </Field>

        <div className="field-row three">
          <Field label="Quantity">
            <input type="number" min="0" step="any" value={form.qty} onChange={setQtyOrRate('qty')} />
          </Field>
          <Field label="Unit">
            <input value={form.unit} onChange={set('unit')} placeholder={category?.unit || 'pcs'} />
          </Field>
          <Field label="Rate (₹)">
            <input type="number" min="0" step="any" value={form.rate} onChange={setQtyOrRate('rate')} />
          </Field>
        </div>

        <div className="field-row">
          <Field label="Amount (₹)" hint={form.amount ? money(form.amount) : 'Fills in from quantity × rate'}>
            <input type="number" min="0" step="any" value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="Bill no.">
            <input value={form.billNo} onChange={set('billNo')} placeholder="Optional" />
          </Field>
        </div>

        {tracksStock && (
          <Field
            label="Quantity used on site"
            hint={`${category.name} is stock-tracked. Whatever is left counts as inventory still on site.`}
          >
            <input
              type="number"
              min="0"
              max={form.qty}
              step="any"
              value={form.usedQty}
              onChange={set('usedQty')}
            />
          </Field>
        )}

        <Attachments
          label="Bill / receipt"
          hint="Photograph the bill on site — images are shrunk automatically before they are uploaded."
          value={form.attachments}
          ownerType="expenses"
          ownerId={form.id}
          onChange={(attachments) => setForm((f) => ({ ...f, attachments }))}
        />
      </div>
    </Dialog>
  )
}
