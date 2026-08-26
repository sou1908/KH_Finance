import { useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import MasterDialog from '../components/MasterDialog'
import TransferDialog from '../components/TransferDialog'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'
import { accountLedger, combinedLedger, ownMoneyAtRisk, transferLedger } from '../store/selectors'
import { money, pct, shortDate } from '../lib/format'

/**
 * The reconciliation view. The sketch splits incoming money three ways — cash,
 * personal accounts, company account — and every bill is paid out of one of
 * them. This page is where those two sides meet.
 */
export default function Accounts() {
  const state = useApp()
  const { scope } = useScope()
  const [dialog, setDialog] = useState(null)

  const rows = accountLedger(state, scope)
  const ledger = combinedLedger(state, scope)

  const totalIn = rows.reduce((t, a) => t + a.inflow, 0)
  const totalOut = rows.reduce((t, a) => t + a.outflow, 0)
  const totalBalance = rows.reduce((t, a) => t + a.balance, 0)

  const transfers = transferLedger(state, scope)
  const moved = transfers.reduce((t, r) => t + r.amount, 0)

  // Any account sitting below zero is money somebody is genuinely out of pocket
  // for. Measuring it as "spent more than received" counted every rupee a
  // partner spent, even when the company had funded them the day before.
  const personalExposure = ownMoneyAtRisk(rows, 'personal')

  const deleteAccount = (account, movements) => {
    if (movements > 0) return
    if (!window.confirm(`Remove "${account.name}"? It has no entries filed against it.`)) return
    state.remove('accounts', account.id)
  }

  return (
    <div className="stack">
      <div className="grid cols-3">
        <Measure label="Into all accounts" value={totalIn} tone="in" foot={`${state.receipts.length} receipts on record`} />
        <Measure label="Out of all accounts" value={totalOut} tone="out" foot={`${state.expenses.length} bills on record`} />
        <Measure
          label="Held across accounts"
          value={totalBalance}
          tone={totalBalance < 0 ? 'warn' : 'left'}
          foot={
            personalExposure > 0
              ? `${money(personalExposure)} is personal money out of pocket — worth settling.`
              : moved > 0
                ? `Includes ${money(moved)} moved between accounts.`
                : 'No personal money is currently out of pocket.'
          }
        />
      </div>

      <Panel
        title={scope === 'all' ? 'Account positions' : 'Account movement on this project'}
        action={
          <>
            <button className="btn tiny" onClick={() => setDialog({ kind: 'transfer' })}>
              Move money
            </button>
            <button className="btn tiny primary" onClick={() => setDialog({ kind: 'account' })}>
              Add account
            </button>
          </>
        }
        flush
      >
        {rows.length === 0 ? (
          <Empty
            title="No accounts set up"
            action={
              <button className="btn primary" onClick={() => setDialog({ kind: 'account' })}>
                Add your first account
              </button>
            }
          >
            Every receipt and bill is filed against an account. Add cash in hand, each partner's personal account, and
            the company account.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  {scope === 'all' && <th className="right col-optional">Opening</th>}
                  <th className="right">In</th>
                  <th className="right">Out</th>
                  <th className="right col-optional">Moved in</th>
                  <th className="right col-optional">Moved out</th>
                  <th className="right">Balance</th>
                  <th className="right col-optional">Share of spend</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  // Movements across the whole book, not just this project — an
                  // account with entries elsewhere must not be deletable here.
                  const totalMovements =
                    state.receipts.filter((r) => r.accountId === a.id).length +
                    state.expenses.filter((e) => e.accountId === a.id).length

                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>
                        {a.name}
                        {a.holder && <span className="sub-line">{a.holder}</span>}
                      </td>
                      <td>
                        <span className={`chip ${a.kind === 'company' ? 'in' : a.kind === 'cash' ? '' : 'out'}`}>
                          {a.kind}
                        </span>
                      </td>
                      {scope === 'all' && <td className="amount note col-optional">{money(a.opening)}</td>}
                      <td className="amount">{money(a.inflow)}</td>
                      <td className="amount">{money(a.outflow)}</td>
                      <td className="amount note col-optional">{a.transferIn ? money(a.transferIn) : '—'}</td>
                      <td className="amount note col-optional">{a.transferOut ? money(a.transferOut) : '—'}</td>
                      <td className={`amount ${a.balance < 0 ? 'neg' : 'pos'}`} style={{ fontWeight: 600 }}>
                        {money(a.balance)}
                      </td>
                      <td className="amount note col-optional">{totalOut ? pct(a.outflow / totalOut) : '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn ghost tiny"
                            onClick={() =>
                              setDialog({ kind: 'account', row: state.accounts.find((x) => x.id === a.id) })
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="btn ghost tiny danger"
                            disabled={totalMovements > 0}
                            title={
                              totalMovements > 0
                                ? `${totalMovements} entries are filed against this account. Move them first.`
                                : 'Remove this account'
                            }
                            onClick={() => deleteAccount(a, totalMovements)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={scope === 'all' ? 3 : 2} style={{ textAlign: 'right' }}>
                    All accounts
                  </th>
                  <th className="amount">{money(totalIn)}</th>
                  <th className="amount">{money(totalOut)}</th>
                  {/* Moved in and out always cancel across all accounts, so
                      showing a total would only ever be noise. */}
                  <th className="col-optional" />
                  <th className="col-optional" />
                  <th className={`amount ${totalBalance < 0 ? 'neg' : 'pos'}`}>{money(totalBalance)}</th>
                  <th colSpan="2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {personalExposure > 0 && (
        <Panel title="Settlement note">
          <p className="note" style={{ margin: 0 }}>
            Personal accounts have paid <strong className="figure">{money(personalExposure)}</strong> more into
            projects than they have received. Reimburse from the company account to bring these back to zero, and
            record it as a transfer once account-to-account transfers land in v2.
          </p>
        </Panel>
      )}

      <Panel title={`Every movement · ${ledger.length}`} flush>
        {ledger.length === 0 ? (
          <Empty title="No movements yet">Receipts and bills both show up here once recorded.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Direction</th>
                  <th>Detail</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.slice(0, 60).map((row) => (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {shortDate(row.date)}
                    </td>
                    <td style={{ fontWeight: 500 }}>{row.account}</td>
                    <td>
                      <span className={`chip ${row.kind === 'in' ? 'in' : 'out'}`}>
                        {row.kind === 'in' ? 'In' : 'Out'}
                      </span>
                    </td>
                    <td>
                      {row.head} · {row.party || '—'}
                      {row.detail && <span className="sub-line">{row.detail}</span>}
                    </td>
                    <td className={`amount ${row.kind === 'in' ? 'pos' : ''}`}>
                      {row.kind === 'in' ? '+' : '−'}
                      {money(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ledger.length > 60 && (
              <div className="note" style={{ padding: '12px 14px' }}>
                Showing the 60 most recent of {ledger.length}. Filter by project above to narrow it down.
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title={`Money moved between accounts · ${transfers.length}`}
        action={
          <button className="btn tiny" onClick={() => setDialog({ kind: 'transfer' })}>
            Move money
          </button>
        }
        flush
      >
        {transfers.length === 0 ? (
          <Empty
            title="No transfers recorded"
            action={
              <button className="btn primary" onClick={() => setDialog({ kind: 'transfer' })}>
                Move money
              </button>
            }
          >
            When the company account funds a partner so they can buy for a job, record it here. It keeps their
            balance honest without ever counting as project income.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data tap-rows">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From → To</th>
                  <th className="col-optional">For</th>
                  <th className="col-optional">Reference</th>
                  <th className="right col-money">Amount</th>
                  <th className="col-optional" />
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} onClick={() => setDialog({ kind: 'transfer', row: state.transfers.find((x) => x.id === t.id) })}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {shortDate(t.date)}
                    </td>
                    <td>
                      <span className="tag-row">
                        {t.fromName} <span className="note">→</span> <strong style={{ fontWeight: 500 }}>{t.toName}</strong>
                      </span>
                      {t.note && <span className="sub-line">{t.note}</span>}
                    </td>
                    <td className="note col-optional">
                      {t.projectName ? <span className="chip move">{t.projectName}</span> : '—'}
                    </td>
                    <td className="note col-optional">
                      {t.mode}
                      {t.reference ? ` · ${t.reference}` : ''}
                    </td>
                    <td className="amount col-money">{money(t.amount)}</td>
                    <td className="col-optional">
                      <div className="row-actions">
                        <button
                          className="btn ghost tiny"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDialog({ kind: 'transfer', row: state.transfers.find((x) => x.id === t.id) })
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn ghost tiny danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm(`Delete the ${money(t.amount)} transfer from ${t.fromName} to ${t.toName}?`)) {
                              state.remove('transfers', t.id)
                            }
                          }}
                        >
                          Delete
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

      {dialog?.kind === 'transfer' ? (
        <TransferDialog
          existing={dialog.row}
          lockedProject={scope !== 'all' && !dialog.row ? scope : null}
          onClose={() => setDialog(null)}
        />
      ) : (
        dialog && <MasterDialog kind={dialog.kind} row={dialog.row} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
