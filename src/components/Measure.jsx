import { money } from '../lib/format'

/**
 * A headline figure, presented as a segment cut from a measuring scale.
 * `tone` picks the semantic colour: in / out / left / warn.
 */
export default function Measure({ label, value, tone = 'in', foot, chip, raw, isText }) {
  return (
    <div className={`measure tone-${tone}`}>
      <svg className="measure-ticks" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: 41 }, (_, i) => (
          <line
            key={i}
            x1={i * 5}
            x2={i * 5}
            y1={0}
            y2={i % 5 === 0 ? 8 : 4}
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="measure-label">
        <span className="eyebrow">{label}</span>
        {chip}
      </div>

      <div className={`measure-value${isText ? ' as-text' : ''}`}>{raw ?? money(value)}</div>
      {foot && <div className="measure-foot">{foot}</div>}
    </div>
  )
}
