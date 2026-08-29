import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import Attachments from './Attachments'
import { useApp } from '../store/AppStore'
import { newId } from '../data/repo'
import { headsOfKind, vendorsOfKind } from '../store/selectors'
import { money, today } from '../lib/format'

/**
 * One company bill: rent, a power bill, an ad campaign, a laptop.
 *
 * Deliberately simpler than the project expense form. There is no quantity, no
 * rate and no stock, because none of it is material that can be left over or
 * moved to another job — a rent bill is an amount and a month, and asking for
 * "50 × ₹300" would be a form fighting its own data.
 *
 * There is also no project field, and there cannot be one. If a cost belongs to
 * a job it is a project expense; this form exists for everything that would
 * still be paid with no jobs running at all.
 */

const NEW_VENDOR = '__new_vendor'

const blank = () => ({
  id: newId('cex'),
  date: today(),
  categoryId: '',
  officeId: '',
  accountId: '',
  vendor: '',
  description: '',
  amount: '',
  billNo: '',
  note: '',
  attachments: [],
})

export default function CompanyExpenseDialog({ existing, onClose }) {
  const state = useApp()
  const { accounts, offices, add, update } = state

  const [form, setForm] = useState(() => (existing ? { ...blank(), ...existing } : blank()))
  const [error, setError] = useState('')

  const heads = headsOfKind(state, 'company')
  // Landlords, the power company, agencies — kept apart from the shops and
  // contractors, so neither list clutters the other's form.
  const vendors = vendorsOfKind(state, 'company')

  // A bill already on file may name a vendor that was never saved to the list.
  // It has to stay editable rather than being silently blanked on save.
  const [typingVendor, setTypingVendor] = useState(
    () => Boolean(existing?.vendor) && !vendors.some((v) => v.name === existing.vendor),
  )
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const pickVendor = (e) => {
    const value = e.target.value
    if (value === NEW_VENDOR) {
      setTypingVendor(true)
      setForm((f) => ({ ...f, vendor: '' }))
      return
    }
    setTypingVendor(false)
    setForm((f) => ({ ...f, vendor: value }))
  }

  const submit = () => {
    const amount = Number(form.amount) || 0
    if (!form.categoryId) return setError('Pick which head this belongs under.')
    if (amount <= 0) return setError('Enter the amount on the bill.')
    if (!form.date) return setError('Give the bill a date.')

    const record = {
      ...form,
      amount,
      vendor: String(form.vendor).trim(),
      description: String(form.description).trim(),
    }

    if (existing) update('companyExpenses', record)
    else add('companyExpenses', record)
    onClose()
  }

  const officeLabel = form.officeId
    ? (offices ?? []).find((o) => o.id === form.officeId)?.name
    : 'the company as a whole'

  return (
    <Dialog
      title={existing ? 'Edit company expense' : 'Record a company expense'}
      subtitle="What the business costs to run — never charged to a client's job."
      onClose={onClose}
      footer={
        <>
          {error && <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Save changes' : 'Record it'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <div className="field-row">
          <Field label="Date">
            <input type="date" value={form.date} onChange={set('date')} />
          </Field>
          <Field label="Head" hint="Rent, electricity, marketing — set up in Settings">
            <select value={form.categoryId} onChange={set('categoryId')} autoFocus>
              <option value="">Select head</option>
              {heads.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="field-row">
          <Field label="Office" hint={`Charged to ${officeLabel}`}>
            <select value={form.officeId} onChange={set('officeId')}>
              <option value="">Company-wide</option>
              {(offices ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paid from">
            <select value={form.accountId} onChange={set('accountId')}>
              <option value="">Not recorded</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Paid to" hint="The landlord, the power company, the agency">
          {typingVendor || vendors.length === 0 ? (
            <input
              value={form.vendor}
              onChange={set('vendor')}
              placeholder={vendors.length === 0 ? 'Save them in Company settings to pick them here' : 'Name'}
            />
          ) : (
            <select value={form.vendor} onChange={pickVendor}>
              <option value="">Not recorded</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.name}>
                  {v.name}
                </option>
              ))}
              <option value={NEW_VENDOR}>Someone else…</option>
            </select>
          )}
        </Field>

        <div className="field-row">
          <Field
            label="Amount (₹)"
            hint={Number(form.amount) > 0 ? money(form.amount) : 'What the bill came to'}
          >
            <input type="number" min="0" step="any" value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="Bill number">
            <input value={form.billNo} onChange={set('billNo')} placeholder="Optional" />
          </Field>
        </div>

        <Field label="What it was for" hint="Which month's rent, which campaign — whatever you'd want to read back">
          <input value={form.description} onChange={set('description')} placeholder="e.g. April rent, Meta ads" />
        </Field>

        <Attachments
          label="Bill / receipt"
          hint="Photograph it now — images are shrunk automatically before they are uploaded."
          value={form.attachments}
          ownerType="companyExpenses"
          ownerId={form.id}
          onChange={(attachments) => setForm((f) => ({ ...f, attachments }))}
        />
      </div>
    </Dialog>
  )
}
