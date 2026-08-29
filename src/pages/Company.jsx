import { useState } from 'react'
import { Link } from 'react-router-dom'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import FlowChart from '../components/FlowChart'
import DashboardSwitch from '../components/DashboardSwitch'
import { useApp } from '../store/AppStore'
import {
  PERIODS,
  companyTotals,
  moneyInHand,
  moneyMovement,
  monthlyCompanyFlow,
  periodRange,
} from '../store/selectors'
import { money, moneyShort, pct, shortDate } from '../lib/format'

// The same palette the project dashboard uses for heads, so a colour means the
// same kind of thing on both screens.
const HEAD_COLOURS = ['#16788a', '#e07f31', '#0f7355', '#2aa3b8', '#a8482c', '#7a6a9c', '#8a7a5e']

/**
 * The company side of the business.
 *
 * Everything here is a MOVEMENT over a period, never a profit. A month where a
 * client pays an advance looks enormous and the month the work is done looks
 * terrible, though nothing about the business changed in between — so the page
 * says "money in hand went up by X" and leaves the word profit alone. Money in
 * hand, at the top, is the figure that means something on its own: it is what
 * every month's movement accumulates into.
 */
export default function Company() {
  const state = useApp()
  const [period, setPeriod] = useState('this-month')

  const range = periodRange(period)
  const hand = moneyInHand(state)
  const move = moneyMovement(state, range)
  const totals = companyTotals(state, range)
  const flow = monthlyCompanyFlow(state, 12)

  const officeName = Object.fromEntries(state.offices.map((o) => [o.id, o.name]))
  const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))

  const recent = [...totals.rows].slice(0, 8)
  const up = move.net >= 0

  // What it costs to keep the lights on. Averaged over the months that actually
  // had bills, not over a fixed twelve: a firm three months into using the app
  // would otherwise see a run rate a quarter of the real one.
  const monthsWithCosts = flow.filter((m) => m.companySpend > 0).length
  const runRate = monthsWithCosts
    ? flow.reduce((t, m) => t + m.companySpend, 0) / monthsWithCosts
    : 0

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Company</span>
          <h1>What the business costs to run</h1>
          <div className="crumb">
            Rent, power, marketing and everything else that is not charged to a client.
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <DashboardSwitch />
      </div>

      <div className="toolbar" style={{ marginBottom: 0 }}>
        <span className="eyebrow">Period</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <Link className="btn" to="/company/expenses">
          Every company bill
        </Link>
      </div>

      <div className="grid cols-3">
        <Measure
          label={`Company costs · ${range.label}`}
          value={totals.total}
          tone="out"
          foot={`${totals.count} bill${totals.count === 1 ? '' : 's'} across ${totals.byHead.length} head${
            totals.byHead.length === 1 ? '' : 's'
          }`}
        />
        <Measure
          label="Costs this much a month"
          value={runRate}
          tone="out"
          foot={
            monthsWithCosts
              ? `Averaged over ${monthsWithCosts} month${monthsWithCosts === 1 ? '' : 's'} that had bills — roughly what it takes to keep the lights on.`
              : 'Record a few months of bills and the run rate appears here.'
          }
        />
        <Measure
          label={`Money in hand ${up ? 'went up' : 'went down'}`}
          value={Math.abs(move.net)}
          tone={up ? 'in' : 'warn'}
          foot={`${range.label} · ${moneyShort(move.clientMoney)} in, ${moneyShort(move.spend)} out`}
        />
      </div>

      {/* The bridge from the two dashboards to the one number they feed. Both
          sides are shown separately because a steady office cost and a lumpy
          job cost tell you different things. */}
      <Panel title={`Where the money went · ${range.label}`}>
        <div className="cost-bridge" style={{ marginTop: 0 }}>
          <span className="eyebrow">Both dashboards, one pool</span>
          <dl>
            <div>
              <dt>Collected from clients</dt>
              <dd className="figure pos">+ {money(move.clientMoney)}</dd>
            </div>
            <div>
              <dt>Spent on projects</dt>
              <dd className="figure neg">− {money(move.projectSpend)}</dd>
            </div>
            <div>
              <dt>Spent running the business</dt>
              <dd className="figure neg">− {money(move.companySpend)}</dd>
            </div>
            <div className="cost-bridge-total">
              <dt>Money in hand {up ? 'went up by' : 'went down by'}</dt>
              <dd className={`figure ${up ? 'pos' : 'neg'}`}>{money(Math.abs(move.net))}</dd>
            </div>
          </dl>
          <p className="note">
            A movement, not profit — a month where a client pays an advance looks good and the month the work is done
            looks bad, though nothing about the business changed. Accumulated, the swings cancel out and it lands on
            the money in hand above.
          </p>
        </div>
      </Panel>

      <div className="grid split">
        <Panel title="Money in vs money out">
          <div className="tag-row" style={{ marginBottom: 12 }}>
            <span className="chip in">
              <span className="swatch" style={{ background: '#16788a' }} /> From clients
            </span>
            <span className="chip out">
              <span className="swatch" style={{ background: '#e07f31' }} /> Everything out
            </span>
          </div>
          <FlowChart data={flow} />
        </Panel>

        <div className="stack">
          <Panel title="What it went on" flush>
            {totals.byHead.length === 0 ? (
              <Empty title="Nothing recorded yet">
                Record the rent, the power bill, the internet — and the split appears here.
              </Empty>
            ) : (
              <div className="bar-list" style={{ padding: '14px 18px' }}>
                {totals.byHead.slice(0, 8).map((h, i) => (
                  <div key={h.id} className="bar-row">
                    <span style={{ fontWeight: 500 }}>{h.name}</span>
                    <span className="figure" style={{ fontSize: 12.5 }}>
                      {money(h.amount)} <span style={{ color: 'var(--ink-3)' }}>· {pct(h.share)}</span>
                    </span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.max(h.share * 100, 1.5)}%`,
                          background: HEAD_COLOURS[i % HEAD_COLOURS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="By office"
            action={
              state.offices.length === 0 ? (
                <Link className="btn tiny" to="/settings">
                  Add offices
                </Link>
              ) : null
            }
            flush
          >
            {totals.byOffice.length === 0 ? (
              <Empty title="Nothing to compare yet">
                Set up your offices in Settings and charge each bill to one, and they can be compared here.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Office</th>
                      <th className="right">Bills</th>
                      <th className="right">Spent</th>
                      <th className="right col-optional">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.byOffice.map((o) => (
                      <tr key={o.id || 'company-wide'}>
                        <td style={{ fontWeight: 500 }}>{o.name}</td>
                        <td className="amount">{o.count}</td>
                        <td className="amount neg">{money(o.amount)}</td>
                        <td className="amount note col-optional">{pct(o.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Latest company bills"
        action={
          <Link className="btn tiny" to="/company/expenses">
            Open ledger
          </Link>
        }
        flush
      >
        {recent.length === 0 ? (
          <Empty
            title="No company expenses yet"
            action={
              <Link className="btn primary" to="/company/expenses">
                Record the first one
              </Link>
            }
          >
            Rent, electricity, internet, marketing, EMIs — anything you would still be paying with no jobs running.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Head</th>
                  <th>Paid to / what for</th>
                  <th className="col-optional">Office</th>
                  <th className="right col-money">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {shortDate(e.date)}
                    </td>
                    <td>
                      <span className="chip out">{catName[e.categoryId] ?? '—'}</span>
                    </td>
                    <td>
                      {e.vendor || '—'}
                      {e.description && <span className="sub-line">{e.description}</span>}
                    </td>
                    <td className="note col-optional">
                      {e.officeId ? officeName[e.officeId] ?? '—' : 'Company-wide'}
                    </td>
                    <td className="amount col-money">{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
