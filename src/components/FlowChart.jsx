import { moneyShort, monthLabel } from '../lib/format'
import { Empty } from './Panel'

/**
 * Month-by-month receipts against spending. Paired bars, not stacked — the
 * question this answers is "did we collect before we spent?", which needs the
 * two read side by side.
 */
export default function FlowChart({ data }) {
  if (!data.length) {
    return <Empty title="Nothing to plot yet">Record a receipt or an expense and the monthly flow appears here.</Empty>
  }

  const W = 760
  const H = 220
  const padL = 56
  const padR = 12
  const padT = 12
  const padB = 30

  const peak = Math.max(...data.flatMap((d) => [d.incoming, d.expenditure]), 1)
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const slot = plotW / data.length
  const barW = Math.min(18, (slot - 10) / 2)

  const y = (v) => padT + plotH - (v / peak) * plotH

  return (
    <svg className="flow-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly money in versus money out">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={padL}
            x2={W - padR}
            y1={padT + plotH * (1 - f)}
            y2={padT + plotH * (1 - f)}
            stroke="#e4edef"
            strokeWidth="1"
          />
          <text
            x={padL - 8}
            y={padT + plotH * (1 - f) + 3}
            textAnchor="end"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="9"
            fill="#86969d"
          >
            {moneyShort(peak * f)}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const cx = padL + slot * i + slot / 2
        return (
          <g key={d.month}>
            <rect
              x={cx - barW - 1}
              y={y(d.incoming)}
              width={barW}
              height={Math.max(padT + plotH - y(d.incoming), 1)}
              fill="#16788a"
            />
            <rect
              x={cx + 1}
              y={y(d.expenditure)}
              width={barW}
              height={Math.max(padT + plotH - y(d.expenditure), 1)}
              fill="#e07f31"
            />
            <text
              x={cx}
              y={H - 10}
              textAnchor="middle"
              fontFamily="IBM Plex Mono, monospace"
              fontSize="9"
              fill="#55666d"
            >
              {monthLabel(d.month)}
            </text>
            <title>{`${monthLabel(d.month)} — in ${moneyShort(d.incoming)}, out ${moneyShort(d.expenditure)}`}</title>
          </g>
        )
      })}

      <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="#c1d2d7" strokeWidth="1" />
    </svg>
  )
}
