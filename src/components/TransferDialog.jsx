import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import Attachments from './Attachments'
import { useApp } from '../store/AppStore'
import { newId } from '../data/repo'
import { accountLedger } from '../store/selectors'
import { money, today } from '../lib/format'

/**
 * Moving money between your own accounts.
 *
 * The company account pays for a project, but a partner does the buying — so
 * money has to reach their account first. Before this existed there was no way
 * to record that, and the partner's balance went negative the moment they spent
 * anything: the app was reading a missing record as an overdraft.
 *
 * A transfer changes account balances and nothing else. It is not income and it
 * is not spending, so it never reaches a project's totals. Attaching a project
 * records WHY the money moved, so an advance can be chased when the job closes.
 */

const MODES = ['UPI', 'NEFT', 'RTGS', 'IMPS', 'Cash', 'Cheque']

const blank = (projectId) => ({
  id: newId('trf'),
  date: today(),
  amount: '',
  fromAccountId: '',
  toAccountId: '',
  projectId: projectId ?? '',
  mode: 'UPI',
  reference: '',
  note: '',
  attachments: [],
})

export default function TransferDialog({ existing, lockedProject, onClose }) {
  const state = useApp()
  const { accounts, projects, add, update } = state

  const [form, setForm] = useState(() => ({ attachments: [], ...(existing ?? blank(lockedProject)) }))
  const [error, setError] = useState('')

  const set = (key) => (e) => {
    setError('')
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  // Balances across everything, so the warning below reflects real position
  // rather than one project's slice of it.
  const balances = accountLedger(state, 'all')
  const source = balances.find((a) => a.id === form.fromAccountId)
  const amount = Number(form.amount) || 0

  // Warned about, never blocked. Site cash is messier than any ledger, and
  // refusing to record what actually happened is worse than an odd-looking row.
  const overdrawn = source && amount > 0 && amount > source.balance

  const submit = () => {
    if (!form.fromAccountId) return setError('Pick the account the money is leaving.')
    if (!form.toAccountId) return setError('Pick the account the money is going to.')
    if (form.fromAccountId === form.toAccountId) {
      return setError('Pick two different accounts — money cannot move to where it already is.')
    }
    if (!(amount > 0)) return setError('Enter an amount greater than zero.')

    const record = { ...form, amount }
    if (existing) update('transfers', record)
    else add('transfers', record)
    onClose()
  }

  return (
    <Dialog
      title={existing ? 'Edit transfer' : 'Move money between accounts'}
      subtitle="Your own money changing pockets — never counted as income or spending."
      onClose={onClose}
      footer={
        <>
          {error && <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Save changes' : 'Record transfer'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <div className="transfer-route">
          <Field label="From" hint={source ? `Holds ${money(source.balance)}` : 'Where the money leaves'}>
            <select value={form.fromAccountId} onChange={set('fromAccountId')}>
              <option value="">Select account</option>
              {balances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <span className="transfer-arrow" aria-hidden="true">→</span>

          <Field
            label="To"
            hint={
              form.toAccountId
                ? `Holds ${money(balances.find((a) => a.id === form.toAccountId)?.balance ?? 0)}`
                : 'Where it lands'
            }
          >
            <select value={form.toAccountId} onChange={set('toAccountId')}>
              <option value="">Select account</option>
              {balances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="field-row three">
          <Field label="Amount (₹)" hint={amount ? money(amount) : 'Rupees'}>
            <input type="number" min="0" step="1" value={form.amount} onChange={set('amount')} placeholder="0" />
          </Field>
          <Field label="Date">
            <input type="date" value={form.date} onChange={set('date')} />
          </Field>
          <Field label="Mode">
            <select value={form.mode} onChange={set('mode')}>
              {MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>

        {overdrawn && (
          <p className="warn-note">
            {source.name} only holds {money(source.balance)}. Recording this anyway will take it to{' '}
            {money(source.balance - amount)} — fine if the money really moved, but worth checking the
            opening balance is set in Settings.
          </p>
        )}

        <Field
          label="For project"
          hint="Optional. Records why the money moved, so an unspent advance can be chased at close. It is never counted as project income."
        >
          <select value={form.projectId} onChange={set('projectId')} disabled={Boolean(lockedProject)}>
            <option value="">Not tied to a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="field-row">
          <Field label="Reference" hint="UTR, cheque no., or slip no.">
            <input value={form.reference} onChange={set('reference')} placeholder="Optional" />
          </Field>
          <Field label="Note" hint="What it is for">
            <input value={form.note} onChange={set('note')} placeholder="e.g. advance for hardware" />
          </Field>
        </div>

        <Attachments
          label="Transfer slip"
          hint="Bank screenshot or receipt for the movement."
          value={form.attachments}
          ownerType="transfers"
          ownerId={form.id}
          onChange={(attachments) => setForm((f) => ({ ...f, attachments }))}
        />
      </div>
    </Dialog>
  )
}
