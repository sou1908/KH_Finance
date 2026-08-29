import { Link } from 'react-router-dom'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import Caliper from '../components/Caliper'
import FlowChart from '../components/FlowChart'
import DashboardSwitch from '../components/DashboardSwitch'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'
import {
  accountLedger,
  categoryBreakdown,
  combinedLedger,
  inventoryLeft,
  monthlyFlow,
  projectTotals,
} from '../store/selectors'
import { money, moneyShort, pct, shortDate } from '../lib/format'

// Built outward from the studio's teal and orange rather than a stock palette:
// two brand anchors, then hues that sit between and beside them.
const HEAD_COLOURS = ['#16788a', '#e07f31', '#0f7355', '#2aa3b8', '#a8482c', '#7a6a9c', '#8a7a5e']

export default function Dashboard() {
  const state = useApp()
  const { scope } = useScope()

  const totals = projectTotals(state, scope)
  const heads = categoryBreakdown(state, scope).filter((c) => c.amount > 0)
  const accounts = accountLedger(state, scope)
  const stock = inventoryLeft(state, scope)
  const flow = monthlyFlow(state, scope)
  const recent = combinedLedger(state, scope, 8)

  const short = totals.remaining < 0

  if (!state.projects.length) {
    return (
      <div className="stack">
        <div className="page-head">
          <div>
            <span className="eyebrow">Projects</span>
            <h1>What the jobs are doing</h1>
          </div>
          <div className="spacer" />
          {/* Kept here too: with no projects yet the company side may still be
              the half that has data, and this is the only way across. */}
          <DashboardSwitch />
        </div>
        <Panel>
          <Empty
            title="No projects yet"
            action={
              <Link className="btn primary" to="/projects">
                Add your first project
              </Link>
            }
          >
            Every receipt and every bill belongs to a project. Create one and the numbers start filling in.
          </Empty>
        </Panel>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Projects</span>
          <h1>What the jobs are doing</h1>
          <div className="crumb">Client money in, job costs out, and what each job is earning.</div>
        </div>
        <div className="spacer" />
        <DashboardSwitch />
      </div>

      <div className="grid cols-3">
        <Measure
          label="Total incoming"
          value={totals.incoming}
          tone="in"
          foot={`${totals.receiptCount} receipt${totals.receiptCount === 1 ? '' : 's'} · ${moneyShort(
            totals.pendingFromClient,
          )} still to collect`}
        />
        <Measure
          label="Total expenditure"
          value={totals.expenditure}
          tone="out"
          foot={`${totals.expenseCount} bill${totals.expenseCount === 1 ? '' : 's'} across ${heads.length} head${
            heads.length === 1 ? '' : 's'
          }`}
        />
        <Measure
          label={short ? 'Short by' : 'Remaining'}
          value={Math.abs(totals.remaining)}
          tone={short ? 'warn' : 'left'}
          chip={
            short ? <span className="chip warn">Funded by firm</span> : <span className="chip ok">In hand</span>
          }
          foot={
            short
              ? 'Spending has passed what the client has paid — time for a payment call.'
              : 'Money received that has not been spent yet.'
          }
        />
      </div>

      <Panel title="Where the project stands">
        <Caliper label="Budget reading" spent={totals.expenditure} received={totals.incoming} />

        {totals.quoted > 0 && (
          <div className="grid cols-3" style={{ marginTop: 20 }}>
            <Figure label="Quoted value" value={money(totals.quoted)} />
            <Figure
              label="Spent against quote"
              value={pct(totals.quoteRatio)}
              tone={totals.quoteRatio > 0.85 ? 'neg' : ''}
            />
            <Figure
              label="Margin at this rate"
              value={money(totals.margin)}
              tone={totals.margin < 0 ? 'neg' : 'pos'}
            />
          </div>
        )}

        {/* Both figures above are struck against consumed cost, not the billed
            total shown at the top, so say so rather than let the two disagree
            silently. */}
        {totals.quoted > 0 && totals.hasTransfers && (
          <p className="note" style={{ marginTop: 14 }}>
            These two use {money(totals.netCost)} — what this job consumed — rather than the {money(totals.expenditure)}{' '}
            billed to it, because{' '}
            {totals.materialOut > 0 && `${money(totals.materialOut)} of material went to other jobs`}
            {totals.materialOut > 0 && totals.materialIn > 0 && ' and '}
            {totals.materialIn > 0 && `${money(totals.materialIn)} came in from other jobs`}. The full working is on the{' '}
            <Link to={`/projects/${scope}`}>project page</Link>.
          </p>
        )}
      </Panel>

      <div className="grid split">
        <Panel title="Money in vs money out">
          <div className="tag-row" style={{ marginBottom: 12 }}>
            <span className="chip in">
              <span className="swatch" style={{ background: '#16788a' }} /> Incoming
            </span>
            <span className="chip out">
              <span className="swatch" style={{ background: '#e07f31' }} /> Expenditure
            </span>
          </div>
          <FlowChart data={flow} />
        </Panel>

        <Panel title="Expenditure by head">
          {heads.length === 0 ? (
            <Empty title="No bills recorded">Add an expense and the split by head shows up here.</Empty>
          ) : (
            <div className="bar-list">
              {heads.map((h, i) => (
                <div className="bar-row" key={h.id}>
                  <span style={{ fontWeight: 500 }}>{h.name}</span>
                  <span className="figure" style={{ fontSize: 12.5 }}>
                    {money(h.amount)} <span style={{ color: 'var(--ink-3)' }}>· {pct(h.share)}</span>
                  </span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${h.share * 100}%`,
                        background: HEAD_COLOURS[i % HEAD_COLOURS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid split">
        <Panel
          title="Latest entries"
          action={
            <Link className="btn tiny" to="/expenses">
              Open ledger
            </Link>
          }
          flush
        >
          {recent.length === 0 ? (
            <Empty title="The ledger is empty">Record a receipt or a bill to get started.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Head</th>
                    <th>Party</th>
                    <th>Account</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {shortDate(row.date)}
                      </td>
                      <td>
                        <span className={`chip ${row.kind === 'in' ? 'in' : 'out'}`}>{row.head}</span>
                      </td>
                      <td>
                        {row.party}
                        {row.detail && <span className="sub-line">{row.detail}</span>}
                      </td>
                      <td className="note">{row.account}</td>
                      <td className={`amount ${row.kind === 'in' ? 'pos' : ''}`}>
                        {row.kind === 'in' ? '+' : '−'}
                        {money(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="stack">
          <Panel
            title="Inventory left"
            action={
              <Link className="btn tiny" to="/inventory">
                Details
              </Link>
            }
          >
            <div className="measure-value" style={{ color: 'var(--patina)', marginTop: 0 }}>
              {money(stock.totalValue)}
            </div>
            <div className="measure-foot">
              {stock.lines.filter((l) => l.left > 0).length} line
              {stock.lines.filter((l) => l.left > 0).length === 1 ? '' : 's'} with material still on site, valued at
              purchase rate.
            </div>
          </Panel>

          <Panel
            title="Account balances"
            action={
              <Link className="btn tiny" to="/accounts">
                Details
              </Link>
            }
            flush
          >
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="right">In</th>
                    <th className="right">Out</th>
                    <th className="right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>{a.name}</td>
                      <td className="amount">{moneyShort(a.inflow)}</td>
                      <td className="amount">{moneyShort(a.outflow)}</td>
                      <td className={`amount ${a.balance < 0 ? 'neg' : 'pos'}`}>{moneyShort(a.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value, tone = '' }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`figure ${tone}`} style={{ fontSize: 19, marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}
