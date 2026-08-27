import { useEffect, useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import Dialog, { Field } from './Dialog'
import { createUser, isCloud, listUsers, removeUser, setUserPassword } from '../data/api'
import { useApp } from '../store/AppStore'
import { shortDate } from '../lib/format'

/**
 * Who can sign in, and as what.
 *
 * Logins are not part of the ledger, so they do not travel through the sync
 * queue — they are read and written directly, and only ever by an owner. A
 * procurement account created here receives quantities and no money at all:
 * the server withholds the figures rather than the screen hiding them.
 */
export default function UsersPanel() {
  const { auth } = useApp()
  const [state, setState] = useState({ loading: true, users: [], roles: [], error: '' })
  const [dialog, setDialog] = useState(null)

  const refresh = () => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    listUsers()
      .then((data) => setState({ loading: false, users: data.users, roles: data.roles, error: '' }))
      .catch((err) => setState({ loading: false, users: [], roles: [], error: err.message }))
  }

  useEffect(() => {
    if (isCloud() && auth.isOwner) refresh()
    else setState({ loading: false, users: [], roles: [], error: '' })
  }, [auth.isOwner])

  // Without a database there is nowhere for a second login to live.
  if (!isCloud()) {
    return (
      <Panel title="Who can sign in">
        <p className="note" style={{ margin: 0 }}>
          Logins need the database. This browser is running in local-only mode, so there is only you and there
          is nothing to sign in to.
        </p>
      </Panel>
    )
  }

  return (
    <>
      <Panel
        title="Who can sign in"
        action={
          <button className="btn tiny" onClick={() => setDialog({ mode: 'new' })}>
            Add a login
          </button>
        }
        flush
      >
        <div style={{ padding: '14px 18px 0' }}>
          <p className="note" style={{ marginTop: 0 }}>
            A <strong>procurement</strong> login sees what was bought and how much is left, and records what goes
            to site. It is never sent rates, amounts, receipts or account balances — not hidden on screen,
            never sent at all.
          </p>
        </div>

        {state.error ? (
          <Empty title="Could not load logins">{state.error}</Empty>
        ) : state.loading ? (
          <Empty title="Loading…" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th className="col-optional">Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>
                      {u.email}
                      {u.isYou && <span className="sub-line">this is you</span>}
                    </td>
                    <td className="note">{u.name || '—'}</td>
                    <td>
                      <span className={`chip ${u.role === 'owner' ? 'in' : 'out'}`}>{u.role}</span>
                    </td>
                    <td className="num note col-optional">{shortDate(String(u.createdAt).slice(0, 10))}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost tiny" onClick={() => setDialog({ mode: 'password', user: u })}>
                          Set password
                        </button>
                        <button
                          className="btn ghost tiny danger"
                          disabled={u.isYou}
                          title={u.isYou ? 'You cannot remove your own login' : 'Remove this login'}
                          onClick={() => {
                            if (!window.confirm(`Remove the login for ${u.email}?\n\nAnything they recorded stays.`)) return
                            removeUser(u.id).then(refresh).catch((err) => window.alert(err.message))
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {dialog && <LoginDialog dialog={dialog} roles={state.roles} onDone={refresh} onClose={() => setDialog(null)} />}
    </>
  )
}

function LoginDialog({ dialog, roles, onDone, onClose }) {
  const isNew = dialog.mode === 'new'
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'procurement' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => {
    setError('')
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const submit = async () => {
    if (form.password.length < 8) return setError('Use a password of at least 8 characters.')

    setBusy(true)
    try {
      if (isNew) await createUser(form)
      else await setUserPassword(dialog.user.id, form.password)
      onDone()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={isNew ? 'Add a login' : `New password for ${dialog.user.email}`}
      subtitle={isNew ? undefined : 'They will be signed out everywhere and will need the new password.'}
      onClose={onClose}
      footer={
        <>
          {error && <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create login' : 'Set password'}
          </button>
        </>
      }
    >
      <div className="dialog-body">
        {isNew && (
          <>
            <div className="field-row">
              <Field label="Email">
                <input type="email" value={form.email} onChange={set('email')} autoComplete="off" autoFocus />
              </Field>
              <Field label="Name">
                <input value={form.name} onChange={set('name')} placeholder="e.g. Ramesh" />
              </Field>
            </div>

            <Field label="Role" hint={roles.find((r) => r.value === form.role)?.label}>
              <select value={form.role} onChange={set('role')}>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.value}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field
          label="Password"
          hint="At least 8 characters. Tell them separately — it cannot be read back here."
        >
          <input
            type="text"
            value={form.password}
            onChange={set('password')}
            autoComplete="off"
            autoFocus={!isNew}
          />
        </Field>
      </div>
    </Dialog>
  )
}
