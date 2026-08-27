import { useState } from 'react'
import Dialog, { Field } from './Dialog'
import { useApp } from '../store/AppStore'
import { newId } from '../data/repo'
import { num, today } from '../lib/format'

/**
 * Recording what happened to material.
 *
 * Three things can happen to something bought: it goes into the building, it
 * goes to a different job, or it goes back to the shop. Each is a row rather
 * than an edit to a running total, so the line keeps its history and two people
 * recording on the same day cannot overwrite each other.
 *
 * No money appears here, and none is needed: quantities are the whole job.
 */

const KINDS = [
  { value: 'used', label: 'Used at site', hint: 'Installed or consumed on this job.' },
  { value: 'moved', label: 'Moved to another job', hint: 'Spare material sent to a different site.' },
  { value: 'returned', label: 'Returned to the vendor', hint: 'Sent back to the shop.' },
]

export default function MovementDialog({ line, onClose }) {
  const { projects, add } = useApp()

  const [form, setForm] = useState({
    type: 'used',
    qty: '',
    toProjectId: '',
    date: today(),
    note: '',
  })
  const [error, setError] = useState('')

  const set = (key) => (e) => {
    setError('')
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const qty = Number(form.qty) || 0
  const remaining = Math.round((line.left - qty) * 1000) / 1000
  const kind = KINDS.find((k) => k.value === form.type)

  // Somewhere else to send it. A job cannot receive from itself.
  const elsewhere = projects.filter((p) => p.id !== line.projectId)

  const submit = () => {
    if (!(qty > 0)) return setError('Enter how many.')
    if (qty > line.left) {
      return setError(`Only ${num(line.left)} ${line.unit || ''} left on this line. Enter that or less.`)
    }
    if (form.type === 'moved' && !form.toProjectId) {
      return setError('Pick the job it is going to.')
    }

    add('movements', {
      id: newId('mov'),
      expenseId: line.expenseId,
      type: form.type,
      qty,
      fromProjectId: line.projectId,
      toProjectId: form.type === 'moved' ? form.toProjectId : '',
      date: form.date,
      note: form.note,
    })
    onClose()
  }

  return (
    <Dialog
      title={line.description}
      subtitle={`${num(line.left)} ${line.unit || ''} still in hand on ${line.projectName}`}
      onClose={onClose}
      footer={
        <>
          {error ? (
            <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>
          ) : (
            qty > 0 && (
              <span className="note">
                Leaves <strong className="figure">{num(remaining)} {line.unit}</strong> in hand
              </span>
            )
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            Record
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <Field label="What happened" hint={kind?.hint}>
          <select value={form.type} onChange={set('type')}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="field-row">
          <Field
            label={`How many${line.unit ? ` (${line.unit})` : ''}`}
            hint={`${num(line.left)} available`}
          >
            <input
              type="number"
              min="0"
              max={line.left}
              step="any"
              value={form.qty}
              onChange={set('qty')}
              placeholder="0"
              autoFocus
            />
          </Field>
          <Field label="Date">
            <input type="date" value={form.date} onChange={set('date')} />
          </Field>
        </div>

        {/* Everything left in one tap, for the common case of clearing a line. */}
        {line.left > 0 && (
          <div className="tag-row">
            <button
              type="button"
              className="btn tiny"
              onClick={() => setForm((f) => ({ ...f, qty: String(line.left) }))}
            >
              All {num(line.left)} {line.unit}
            </button>
          </div>
        )}

        {form.type === 'moved' && (
          <Field label="Moving to" hint="The material stays yours — only the job it is standing on changes.">
            <select value={form.toProjectId} onChange={set('toProjectId')}>
              <option value="">Select a job</option>
              {elsewhere.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Note" hint="Optional — who took it, where it went, anything worth remembering.">
          <input value={form.note} onChange={set('note')} placeholder="e.g. wardrobe carcass, first floor" />
        </Field>
      </div>
    </Dialog>
  )
}
