import { useState } from 'react'
import { useApp } from '../store/AppStore'
import { peek } from '../data/outbox'

export default function SignIn() {
  const { auth } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pending = peek().length

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await auth.signIn(email.trim(), password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="signin">
      <form className="signin-card" onSubmit={submit}>
        <div className="signin-mark">
          <span className="wordmark">
            <span className="k">K</span>alope
          </span>
          <span className="homes">Homes</span>
          <span className="eyebrow" style={{ display: 'block', marginTop: 10 }}>
            Project Finance
          </span>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="signin-error">{error}</p>}

        {pending > 0 && (
          <p className="note">
            {pending} change{pending === 1 ? '' : 's'} recorded on this device have not reached the server yet. They
            will be sent as soon as you sign in.
          </p>
        )}

        <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
