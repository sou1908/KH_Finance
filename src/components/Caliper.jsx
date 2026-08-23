import { money, pct } from '../lib/format'

/**
 * The signature reading. A ruled beam where the jaw marks how far the money
 * received has been spent. Each major tick is 10% — so "where's the jaw?" is a
 * real measurement, not a decorative progress bar.
 */
export default function Caliper({ label, spent, received, hint }) {
  const ratio = received > 0 ? spent / received : 0
  const clamped = Math.min(Math.max(ratio, 0), 1)
  const over = ratio > 1

  return (
    <div className="caliper">
      <div className="caliper-head">
        <span className="eyebrow">{label}</span>
        <span className={`reading ${over ? 'neg' : ''}`}>
          {received > 0 ? pct(ratio) : '—'} of receipts spent
        </span>
      </div>

      <div className="caliper-beam">
        <div
          className={`caliper-fill${over ? ' over' : ''}`}
          style={{ width: `${clamped * 100}%` }}
        />

        <svg className="caliper-scale" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 51 }, (_, i) => {
            const major = i % 5 === 0
            return (
              <line
                key={i}
                x1={i * 2}
                x2={i * 2}
                y1={major ? 0 : 0}
                y2={major ? 11 : 6}
                stroke="#c1d2d7"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>

        <div className="caliper-jaw" style={{ left: `${clamped * 100}%` }} aria-hidden="true" />
      </div>

      <div className="caliper-foot">
        <span>{money(spent)} spent</span>
        <span>{hint ?? `${money(received)} received`}</span>
      </div>
    </div>
  )
}
