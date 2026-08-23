import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import Attachments from './Attachments'
import { useApp } from '../store/AppStore'
import { newId } from '../data/repo'
import { money, today } from '../lib/format'

const MODES = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Cheque', 'Card']

const blank = (projectId) => ({
  id: newId('rec'),
  projectId: projectId ?? '',
  date: today(),
  amount: '',
  accountId: '',
  mode: 'UPI',
  reference: '',
  note: '',
  attachments: [],
})

export default function ReceiptDialog({ existing, lockedProject, onClose }) {
  const { projects, accounts, add, update } = useApp()
  const [form, setForm] = useState(() => ({ attachments: [], ...(existing ?? blank(lockedProject)) }))
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = () => {
    if (!form.projectId) return setError('Pick the project this payment belongs to.')
    if (!form.accountId) return setError('Pick where the money landed.')
    const amount = Number(form.amount)
    if (!amount || amount <= 0) return setError('Enter an amount greater than zero.')

    const record = { ...form, amount }
    if (existing) update('receipts', record)
    else add('receipts', record)
    onClose()
  }

  return (
    <Dialog
      title={existing ? 'Edit receipt' : 'Record a payment received'}
      subtitle="Money coming in from the client — cash, a personal account, or the company account."
      onClose={onClose}
      footer={
        <>
          {error && <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Save changes' : 'Record receipt'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <div className="field-row">
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
          <Field label="Date">
            <input type="date" value={form.date} onChange={set('date')} />
          </Field>
        </div>

        <div className="field-row three">
          <Field label="Amount (₹)" hint={form.amount ? money(form.amount) : 'Rupees'}>
            <input type="number" min="0" step="1" value={form.amount} onChange={set('amount')} placeholder="0" />
          </Field>
          <Field label="Received in" hint="Where the money actually landed">
            <select value={form.accountId} onChange={set('accountId')}>
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mode">
            <select value={form.mode} onChange={set('mode')}>
              {MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="field-row">
          <Field label="Reference" hint="UTR, cheque no., or slip no.">
            <input value={form.reference} onChange={set('reference')} placeholder="Optional" />
          </Field>
          <Field label="Note" hint="What stage this covers">
            <input value={form.note} onChange={set('note')} placeholder="e.g. Advance 30%" />
          </Field>
        </div>

        <Attachments
          label="Payment slip"
          hint="Bank screenshot, cheque photo, or the signed cash receipt."
          value={form.attachments}
          ownerType="receipts"
          ownerId={form.id}
          onChange={(attachments) => setForm((f) => ({ ...f, attachments }))}
        />
      </div>
    </Dialog>
  )
}
