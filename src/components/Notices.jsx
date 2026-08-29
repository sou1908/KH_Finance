import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Dialog from './Dialog'
import { useApp } from '../store/AppStore'
import { notices, todayISO } from '../store/selectors'
import { markSeen, seenMap } from '../data/notices'
import { money, shortDate } from '../lib/format'

/**
 * Reminders, in the two places they belong.
 *
 * The popup interrupts once a day and then gets out of the way. The bell keeps
 * the list, so dismissing the popup never loses anything — which is what makes
 * the popup safe to dismiss quickly.
 */

const label = (n) => {
  if (n.urgency === 'late') {
    const days = Math.abs(n.daysAway)
    return days === 1 ? '1 day late' : `${days} days late`
  }
  if (n.urgency === 'today') return 'Due today'
  return n.daysAway === 1 ? 'Due tomorrow' : `In ${n.daysAway} days`
}

/** Recomputes on its own, so a session left open overnight still fires. */
function useToday() {
  const [day, setDay] = useState(todayISO)
  useEffect(() => {
    const id = setInterval(() => setDay(todayISO()), 60_000)
    return () => clearInterval(id)
  }, [])
  return day
}

export function NoticePopup() {
  const state = useApp()
  const navigate = useNavigate()
  const today = useToday()

  // Held in state as well as storage: writing to localStorage does not
  // re-render, so without this the popup would reappear the instant it closed.
  const [seen, setSeen] = useState(seenMap)

  const all = useMemo(() => notices(state, { today }), [state, today])
  const unseen = all.filter((n) => seen[n.key] !== today)

  if (!unseen.length) return null

  const dismiss = () => setSeen(markSeen(unseen.map((n) => n.key), today))

  const open = () => {
    dismiss()
    navigate('/company/due')
  }

  const late = unseen.filter((n) => n.urgency === 'late').length
  const total = unseen.reduce((t, n) => t + n.amount, 0)

  return (
    <Dialog
      title={late ? `${late} payment${late === 1 ? '' : 's'} overdue` : 'Coming up'}
      subtitle={
        unseen.length === 1
          ? 'One thing needs your attention.'
          : `${unseen.length} things need your attention.`
      }
      onClose={dismiss}
      footer={
        <>
          <span className="note">Shown once a day until it is recorded.</span>
          <div className="spacer" />
          <button className="btn ghost" onClick={dismiss}>
            Not now
          </button>
          <button className="btn primary" onClick={open}>
            Open what's due
          </button>
        </>
      }
    >
      <div className="dialog-body">
        <ul className="notice-list">
          {unseen.map((n) => (
            <li key={n.key} className={`notice-row is-${n.urgency}`}>
              <div className="notice-when">
                <span className={`chip ${n.urgency === 'late' ? 'warn' : 'out'}`}>{label(n)}</span>
                <span className="note num">{shortDate(n.due)}</span>
              </div>
              <div className="notice-what">
                <strong>{n.title}</strong>
                <span className="note">
                  {n.kind === 'receivable' ? 'Owed to you' : 'To pay'}
                  {n.party && ` · ${n.party}`}
                  {n.overdueCount > 1 && ` · ${n.overdueCount} instalments unrecorded`}
                </span>
              </div>
              <span className="figure">{n.amount > 0 ? money(n.amount) : 'Varies'}</span>
            </li>
          ))}
        </ul>

        {total > 0 && (
          <p className="note" style={{ marginTop: 12 }}>
            {money(total)} in total.
          </p>
        )}
      </div>
    </Dialog>
  )
}

/**
 * The bell. Counts what is outstanding rather than what is unread: a bill you
 * dismissed this morning has not gone away, and a badge that clears on a glance
 * would say it had.
 */
export function NoticeBell() {
  const state = useApp()
  const navigate = useNavigate()
  const today = useToday()
  const [open, setOpen] = useState(false)
  const holder = useRef(null)

  const all = useMemo(() => notices(state, { today }), [state, today])

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => {
      if (holder.current && !holder.current.contains(e.target)) setOpen(false)
    }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const late = all.filter((n) => n.urgency === 'late').length

  return (
    <div className="bell-holder" ref={holder}>
      <button
        type="button"
        className={`bell${all.length ? ' has-notices' : ''}`}
        aria-label={all.length ? `${all.length} reminders` : 'No reminders'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <path
            d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5v2.8L4 12.5h12l-1.5-2.7V7A4.5 4.5 0 0 0 10 2.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8.2 15a1.8 1.8 0 0 0 3.6 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {all.length > 0 && <span className={`bell-badge${late ? ' is-late' : ''}`}>{all.length}</span>}
      </button>

      {open && (
        <div className="notice-panel" role="dialog" aria-label="Reminders">
          <div className="notice-panel-head">
            <span className="eyebrow">Reminders</span>
            <div className="spacer" style={{ flex: 1 }} />
            {all.length > 0 && (
              <button
                className="btn ghost tiny"
                onClick={() => {
                  setOpen(false)
                  navigate('/company/due')
                }}
              >
                See all
              </button>
            )}
          </div>

          {all.length === 0 ? (
            <div className="notice-empty">
              <strong>Nothing due</strong>
              <span className="note">
                Reminders appear here as each one comes within the warning window you set for it.
              </span>
            </div>
          ) : (
            <ul className="notice-list">
              {all.map((n) => (
                <li key={n.key} className={`notice-row is-${n.urgency}`}>
                  <div className="notice-when">
                    <span className={`chip ${n.urgency === 'late' ? 'warn' : 'out'}`}>{label(n)}</span>
                    <span className="note num">{shortDate(n.due)}</span>
                  </div>
                  <div className="notice-what">
                    <strong>{n.title}</strong>
                    <span className="note">
                      {n.kind === 'receivable' ? 'Owed to you' : 'To pay'}
                      {n.party && ` · ${n.party}`}
                    </span>
                  </div>
                  <span className="figure">{n.amount > 0 ? money(n.amount) : 'Varies'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
