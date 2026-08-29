import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import { useApp } from '../store/AppStore'
import { newId } from '../data/repo'
import { headsOfKind, occurrences, todayISO } from '../store/selectors'
import { money, shortDate } from '../lib/format'

/**
 * Something that will need paying, or chasing.
 *
 * One form for an EMI, the rent, the wifi bill and a friend who owes you money,
 * because they are the same sentence: an amount, a party, a date, and how often
 * it comes round again.
 *
 * It records nothing about money that has moved. Settling a commitment writes a
 * real bill in the ledger — this only says what is coming, so a reminder can
 * never be mistaken for a payment.
 */

const EVERY = [
  { value: 1, label: 'Every month' },
  { value: 3, label: 'Every 3 months' },
  { value: 6, label: 'Every 6 months' },
  { value: 12, label: 'Every year' },
  { value: 0, label: 'One time only' },
]

const blank = () => ({
  id: newId('cmt'),
  kind: 'payable',
  name: '',
  party: '',
  amount: '',
  categoryId: '',
  officeId: '',
  accountId: '',
  everyMonths: 1,
  dayOfMonth: new Date().getDate(),
  startDate: todayISO(),
  endDate: '',
  totalAmount: '',
  remindDays: 3,
  active: true,
  note: '',
})

export default function CommitmentDialog({ existing, onClose }) {
  const state = useApp()
  const { accounts, offices, add, update } = state

  const [form, setForm] = useState(() => (existing ? { ...blank(), ...existing } : blank()))
  const [error, setError] = useState('')

  const heads = headsOfKind(state, 'company')
  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const payable = form.kind === 'payable'
  const oneOff = Number(form.everyMonths) === 0

  // The next few dates, shown live. A schedule is far easier to check by
  // reading the dates it produces than by reading the rule that produced them.
  const preview = occurrences(
    { ...form, everyMonths: Number(form.everyMonths) || 0, dayOfMonth: Number(form.dayOfMonth) || 1 },
    form.startDate || todayISO(),
    '2099-12-31',
  ).slice(0, 3)

  const submit = () => {
    if (!String(form.name).trim()) return setError('Give it a name — "Bank loan EMI", "Andheri rent".')
    if (!form.startDate) return setError(oneOff ? 'When is it due?' : 'When does it start?')
    if (payable && !form.categoryId) return setError('Pick the head it books under when you pay it.')

    const record = {
      ...form,
      name: String(form.name).trim(),
      party: String(form.party).trim(),
      amount: Number(form.amount) || 0,
      totalAmount: Number(form.totalAmount) || 0,
      everyMonths: Number(form.everyMonths) || 0,
      dayOfMonth: Math.min(Math.max(Number(form.dayOfMonth) || 1, 1), 31),
      remindDays: Math.min(Math.max(Number(form.remindDays) || 0, 0), 60),
      active: form.active !== false,
    }

    if (existing) update('commitments', record)
    else add('commitments', record)
    onClose()
  }

  return (
    <Dialog
      title={existing ? 'Edit reminder' : 'Add a reminder'}
      subtitle="What is coming, and when to warn you. Nothing here is a payment."
      onClose={onClose}
      footer={
        <>
          {error && <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Save changes' : 'Add it'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <Field label="Which way does the money go?">
          <div className="seg-field">
            <button
              type="button"
              className={`seg-opt${payable ? ' is-active' : ''}`}
              onClick={() => setForm((f) => ({ ...f, kind: 'payable' }))}
            >
              I have to pay it
            </button>
            <button
              type="button"
              className={`seg-opt${!payable ? ' is-active' : ''}`}
              onClick={() => setForm((f) => ({ ...f, kind: 'receivable' }))}
            >
              Someone owes me
            </button>
          </div>
        </Field>

        <div className="field-row">
          <Field label="Name" hint={payable ? 'e.g. Bank loan EMI, Andheri rent' : 'e.g. Lent to Ramesh'}>
            <input value={form.name} onChange={set('name')} autoFocus />
          </Field>
          <Field label={payable ? 'Paid to' : 'Owed by'}>
            <input value={form.party} onChange={set('party')} placeholder="Who" />
          </Field>
        </div>

        <div className="field-row">
          <Field
            label="Amount each time (₹)"
            hint={
              Number(form.amount) > 0
                ? money(form.amount)
                : 'Leave at 0 if it changes each time, like an electricity bill.'
            }
          >
            <input type="number" min="0" step="any" value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="How often">
            <select value={form.everyMonths} onChange={set('everyMonths')}>
              {EVERY.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="field-row">
          <Field label={oneOff ? 'Due on' : 'Starting from'}>
            <input type="date" value={form.startDate} onChange={set('startDate')} />
          </Field>
          {!oneOff && (
            <Field
              label="Day of the month"
              hint="31 still falls due in February, on the 28th or 29th."
            >
              <input type="number" min="1" max="31" value={form.dayOfMonth} onChange={set('dayOfMonth')} />
            </Field>
          )}
        </div>

        <Field
          label="Warn me this many days ahead"
          hint={
            Number(form.remindDays) > 0
              ? `It appears on the dashboard ${form.remindDays} day${Number(form.remindDays) === 1 ? '' : 's'} before, and stays until you record it.`
              : 'Only on the day itself.'
          }
        >
          <input type="number" min="0" max="60" value={form.remindDays} onChange={set('remindDays')} />
        </Field>

        {payable && (
          <div className="field-row">
            <Field label="Books under" hint="Which company head the bill lands in when you pay it">
              <select value={form.categoryId} onChange={set('categoryId')}>
                <option value="">Select head</option>
                {heads.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Usually paid from">
              <select value={form.accountId} onChange={set('accountId')}>
                <option value="">Not set</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {payable && (
          <Field label="Office">
            <select value={form.officeId} onChange={set('officeId')}>
              <option value="">Company-wide</option>
              {(offices ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {!oneOff && (
          <div className="field-row">
            <Field label="Last instalment" hint="For an EMI with a fixed tenure. Leave blank to run until you stop it.">
              <input type="date" value={form.endDate ?? ''} onChange={set('endDate')} />
            </Field>
            <Field
              label="Total to repay (₹)"
              hint={
                Number(form.totalAmount) > 0
                  ? `${money(form.totalAmount)} — the app tracks what is left as you record each payment.`
                  : 'Optional. Fill it in for a loan and you get a running balance.'
              }
            >
              <input type="number" min="0" step="any" value={form.totalAmount} onChange={set('totalAmount')} />
            </Field>
          </div>
        )}

        {preview.length > 0 && (
          <p className="note" style={{ marginTop: 4 }}>
            Next {preview.length === 1 ? 'date' : 'dates'}: {preview.map(shortDate).join(' · ')}
            {!oneOff && form.endDate && ` — last on ${shortDate(form.endDate)}`}
          </p>
        )}

        <Field label="Note">
          <input value={form.note} onChange={set('note')} placeholder="Loan account number, terms, anything" />
        </Field>

        <Field label="Active">
          <label className="note" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={form.active !== false} onChange={set('active')} />
            Remind me about this
          </label>
        </Field>
      </div>
    </Dialog>
  )
}
