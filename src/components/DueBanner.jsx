import { Link } from 'react-router-dom'
import { useApp } from '../store/AppStore'
import { dueSoon } from '../store/selectors'
import { money, shortDate } from '../lib/format'

/**
 * The reminder, on both dashboards.
 *
 * It appears only when something actually needs doing, and disappears the rest
 * of the time. A banner that is always there stops being read within a week,
 * and then the one week it matters it is invisible too.
 *
 * Each commitment sets its own warning window, so an EMI can ask for a week
 * while the wifi bill asks for a day.
 */
export default function DueBanner() {
  const state = useApp()
  const rows = dueSoon(state)
  if (!rows.length) return null

  const late = rows.filter((r) => r.overdue)
  const total = rows.reduce((t, r) => t + (Number(r.amount) || 0), 0)

  return (
    <div className={`due-banner${late.length ? ' is-late' : ''}`}>
      <div className="due-banner-head">
        <span className="eyebrow">{late.length ? 'Overdue' : 'Coming up'}</span>
        <strong>
          {rows.length} payment{rows.length === 1 ? '' : 's'} need
          {rows.length === 1 ? 's' : ''} your attention
        </strong>
        {total > 0 && <span className="note">· {money(total)} in total</span>}
        <div className="spacer" style={{ flex: 1 }} />
        <Link className="btn tiny" to="/company/due">
          Open
        </Link>
      </div>

      <ul className="due-banner-list">
        {rows.slice(0, 4).map((r) => (
          <li key={r.id}>
            <span className={`chip ${r.overdue ? 'warn' : 'out'}`}>{whenLabel(r)}</span>
            <span className="due-what">
              {r.name}
              {r.party && <span className="note"> · {r.party}</span>}
            </span>
            <span className="figure">{Number(r.amount) > 0 ? money(r.amount) : 'Amount varies'}</span>
            <span className="note due-date">{shortDate(r.due)}</span>
          </li>
        ))}
        {rows.length > 4 && (
          <li className="note">
            and {rows.length - 4} more — <Link to="/company/due">see all</Link>
          </li>
        )}
      </ul>
    </div>
  )
}

/**
 * Plain language, because "-13" is not something anyone reads as "thirteen days
 * late" at a glance.
 */
export function whenLabel(row) {
  if (row.overdue) {
    const days = Math.abs(row.daysAway)
    return days === 1 ? '1 day late' : `${days} days late`
  }
  if (row.dueToday) return 'Due today'
  if (row.daysAway === 1) return 'Due tomorrow'
  return `In ${row.daysAway} days`
}
