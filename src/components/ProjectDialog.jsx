import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import Attachments from './Attachments'
import { useApp } from '../store/AppStore'
import { newId } from '../data/repo'
import { PROJECT_STATUS } from '../data/masters'
import { money, today } from '../lib/format'
import { phoneLinks } from '../lib/phone'

const blank = () => ({
  id: newId('pro'),
  name: '',
  clientId: '',
  phone: '',
  site: '',
  quotedAmount: '',
  startDate: today(),
  status: 'Active',
  note: '',
  attachments: [],
})

export default function ProjectDialog({ existing, onClose }) {
  const { clients, add, update } = useApp()
  const [form, setForm] = useState(() => ({ attachments: [], ...(existing ?? blank()) }))
  const [newClient, setNewClient] = useState('')
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Tell the user up front whether the number will work, and what happens if
  // they leave it blank but the client already has one on file.
  const selectedClient = clients.find((c) => c.id === form.clientId)
  const typed = phoneLinks(form.phone)
  const contactHint = form.phone
    ? typed
      ? `Dials ${typed.tel.replace('tel:', '')}`
      : 'That does not look like a phone number yet.'
    : phoneLinks(selectedClient?.phone)
      ? `Will use ${selectedClient.name}’s number, ${selectedClient.phone}.`
      : null

  const submit = () => {
    if (!form.name.trim()) return setError('Give the project a name.')

    let clientId = form.clientId
    if (clientId === '__new') {
      if (!newClient.trim()) return setError('Enter the client name.')
      clientId = add('clients', { name: newClient.trim(), phone: '', note: '' }).id
    }

    const record = { ...form, clientId, quotedAmount: Number(form.quotedAmount) || 0 }
    if (existing) update('projects', record)
    else add('projects', record)
    onClose()
  }

  return (
    <Dialog
      title={existing ? 'Edit project' : 'New project'}
      subtitle="Every receipt and bill is filed under a project."
      onClose={onClose}
      footer={
        <>
          {error && <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {existing ? 'Save changes' : 'Create project'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <Field label="Project name">
          <input value={form.name} onChange={set('name')} placeholder="e.g. Kothari Residence — 3BHK" />
        </Field>

        <div className="field-row">
          <Field label="Client">
            <select value={form.clientId} onChange={set('clientId')}>
              <option value="">Unassigned</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ Add a new client</option>
            </select>
          </Field>
          <Field label="Site">
            <input value={form.site} onChange={set('site')} placeholder="Area, city" />
          </Field>
        </div>

        {form.clientId === '__new' && (
          <Field label="New client name">
            <input value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="Client name" />
          </Field>
        )}

        <Field
          label="Contact number"
          hint={
            contactHint ??
            'Tap-to-call and WhatsApp appear next to the project name. Leave blank to use the client’s number.'
          }
        >
          <input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={set('phone')}
            placeholder="98200 11223"
          />
        </Field>

        <div className="field-row three">
          <Field label="Quoted value (₹)" hint={form.quotedAmount ? money(form.quotedAmount) : 'Sets the margin target'}>
            <input type="number" min="0" step="1" value={form.quotedAmount} onChange={set('quotedAmount')} />
          </Field>
          <Field label="Start date">
            <input type="date" value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set('status')}>
              {PROJECT_STATUS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Scope note">
          <textarea rows="2" value={form.note} onChange={set('note')} placeholder="What the job covers" />
        </Field>

        <Attachments
          label="Project documents"
          hint="Signed quotation, drawings, BOQ, site photos."
          value={form.attachments}
          ownerType="projects"
          ownerId={form.id}
          onChange={(attachments) => setForm((f) => ({ ...f, attachments }))}
        />
      </div>
    </Dialog>
  )
}
