import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Panel, { Empty } from '../components/Panel'
import Measure from '../components/Measure'
import Caliper from '../components/Caliper'
import FlowChart from '../components/FlowChart'
import ProjectDialog from '../components/ProjectDialog'
import ReceiptDialog from '../components/ReceiptDialog'
import ExpenseDialog from '../components/ExpenseDialog'
import CompleteProjectDialog from '../components/CompleteProjectDialog'
import TransferDialog from '../components/TransferDialog'
import ContactLinks from '../components/ContactLinks'
import { AttachmentGallery } from '../components/Attachments'
import { projectContact } from '../lib/phone'
import { useApp } from '../store/AppStore'
import {
  accountLedger,
  categoryBreakdown,
  combinedLedger,
  inventoryLeft,
  monthlyFlow,
  projectAdvances,
  projectTotals,
} from '../store/selectors'
import { downloadCSV, money, moneyShort, num, pct, shortDate, toCSV } from '../lib/format'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useApp()
  const [dialog, setDialog] = useState(null)

  const project = state.projects.find((p) => p.id === id)

  if (!project) {
    return (
      <Panel>
        <Empty title="Project not found" action={<Link className="btn" to="/projects">Back to projects</Link>}>
          It may have been deleted.
        </Empty>
      </Panel>
    )
  }

  const client = state.clients.find((c) => c.id === project.clientId)
  const contact = projectContact(project, client)
  const totals = projectTotals(state, id)
  const heads = categoryBreakdown(state, id).filter((h) => h.amount > 0)
  const accounts = accountLedger(state, id).filter((a) => a.movements > 0)
  const stock = inventoryLeft(state, id)
  const advances = projectAdvances(state, id)
  const ledger = combinedLedger(state, id)
  const short = totals.remaining < 0

  // Every file filed against this job, labelled with what it belongs to.
  const documents = [
    ...(project.attachments ?? []).map((a) => ({ ...a, source: 'Project document' })),
    ...state.receipts
      .filter((r) => r.projectId === id)
      .flatMap((r) => (r.attachments ?? []).map((a) => ({ ...a, source: `Receipt · ${money(r.amount)}` }))),
    ...state.expenses
      .filter((e) => e.projectId === id)
      .flatMap((e) => (e.attachments ?? []).map((a) => ({ ...a, source: e.vendor || 'Bill' }))),
  ]

  const exportLedger = () => {
    const csv = toCSV(ledger, [
      { label: 'Date', get: (r) => r.date },
      { label: 'Type', get: (r) => (r.kind === 'in' ? 'Incoming' : 'Expenditure') },
      { label: 'Head', get: (r) => r.head },
      { label: 'Party', get: (r) => r.party },
      { label: 'Detail', get: (r) => r.detail },
      { label: 'Account', get: (r) => r.account },
      { label: 'Amount', get: (r) => r.amount },
    ])
    downloadCSV(`${project.name.replace(/[^\w]+/g, '-').toLowerCase()}-ledger.csv`, csv)
  }

  const isDone = project.status === 'Completed'
  const leftovers = stock.lines.filter((l) => l.left > 0)

  // Stock standing here that was bought against another job. Its bought/used
  // figures belong to that job, so showing them here would misread as this
  // job's own purchase.
  const nameOf = (pid) => state.projects.find((p) => p.id === pid)?.name
  const cameFrom = (line) => (line.projectId === id ? null : nameOf(line.projectId))

  const reopen = () => state.update('projects', { ...project, status: 'Active' })

  /**
   * The ledger merges receipts and expenses into one list, so opening a row for
   * editing means going back to whichever table it actually came from.
   */
  const editEntry = (row) => {
    const entity = row.kind === 'in' ? 'receipts' : 'expenses'
    const record = state[entity].find((r) => r.id === row.id)
    if (record) setDialog({ kind: row.kind === 'in' ? 'receipt' : 'expense', row: record })
  }

  /** For an entry that should never have been recorded at all. */
  const deleteEntry = (row) => {
    const entity = row.kind === 'in' ? 'receipts' : 'expenses'
    const noun = row.kind === 'in' ? 'receipt' : 'expense'
    const from = row.party ? ` from ${row.party}` : ''
    if (!window.confirm(`Delete the ${money(row.amount)} ${noun}${from} dated ${shortDate(row.date)}?`)) return
    state.remove(entity, row.id)
  }

  const deleteProject = () => {
    if (!window.confirm(`Delete "${project.name}" and all ${ledger.length} of its entries? This cannot be undone.`)) return
    state.removeProject(project.id)
    navigate('/projects')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <Link to="/projects" style={{ color: 'inherit' }}>
              Projects
            </Link>{' '}
            / {client?.name ?? 'Unassigned'}
          </span>
          <h1>{project.name}</h1>
          <div className="crumb tag-row" style={{ marginTop: 4 }}>
            <span className={`chip ${isDone ? 'ok' : project.status === 'On hold' ? 'warn' : 'in'}`}>
              {project.status}
            </span>
            {project.site || 'Site not set'} · started {shortDate(project.startDate)}
            <ContactLinks contact={contact} />
          </div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setDialog({ kind: 'receipt' })}>
          Add receipt
        </button>
        <button className="btn" onClick={() => setDialog({ kind: 'expense' })}>
          Add expense
        </button>
        {isDone ? (
          <button className="btn" onClick={reopen}>
            Reopen project
          </button>
        ) : (
          <button className="btn primary" onClick={() => setDialog({ kind: 'complete' })}>
            Mark completed
          </button>
        )}
        <button className="btn ghost" onClick={() => setDialog({ kind: 'project', row: project })}>
          Edit
        </button>
      </div>

      <div className="stack">
        <div className="grid cols-3">
          <Measure
            label="Total incoming"
            value={totals.incoming}
            tone="in"
            foot={
              totals.quoted
                ? `${pct(totals.quoted ? totals.incoming / totals.quoted : 0)} of the ${moneyShort(
                    totals.quoted,
                  )} quote collected`
                : `${totals.receiptCount} receipt${totals.receiptCount === 1 ? '' : 's'}`
            }
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
            chip={short ? <span className="chip warn">Funded by firm</span> : <span className="chip ok">In hand</span>}
            foot={short ? 'Spent past what the client has paid.' : 'Received but not yet spent.'}
          />
        </div>

        <Panel title="Reading">
          <Caliper
            label="Spent against receipts"
            spent={totals.expenditure}
            received={totals.incoming}
            hint={`${money(totals.incoming)} received`}
          />
          {totals.quoted > 0 && (
            <div className="grid cols-3" style={{ marginTop: 20 }}>
              <KV label="Quoted" value={money(totals.quoted)} />
              <KV label="Still to collect" value={money(totals.pendingFromClient)} />
              <KV
                label="Margin at this rate"
                value={money(totals.margin)}
                tone={totals.margin < 0 ? 'neg' : 'pos'}
              />
            </div>
          )}

          {/* Shown in full rather than folded silently into one figure: the
              bill stays what the bill says, and the correction is visible
              beside it so nobody wonders where a number went. */}
          {totals.hasTransfers && (
            <div className="cost-bridge">
              <span className="eyebrow">What this job actually cost</span>
              <dl>
                <div>
                  <dt>Billed to this job</dt>
                  <dd className="figure">{money(totals.expenditure)}</dd>
                </div>
                {totals.materialOut > 0 && (
                  <div>
                    <dt>Material sent to other jobs</dt>
                    <dd className="figure neg">− {money(totals.materialOut)}</dd>
                  </div>
                )}
                {totals.materialIn > 0 && (
                  <div>
                    <dt>Material received from other jobs</dt>
                    <dd className="figure pos">+ {money(totals.materialIn)}</dd>
                  </div>
                )}
                <div className="cost-bridge-total">
                  <dt>Consumed by this job</dt>
                  <dd className="figure">{money(totals.netCost)}</dd>
                </div>
              </dl>
              <p className="note" style={{ margin: '10px 0 0' }}>
                Bills are never rewritten — they match the paper in your file. Material moved between jobs is
                valued at what you paid for it, and the margin above uses this figure rather than the billed one.
              </p>
            </div>
          )}
          {project.note && <p className="note" style={{ marginBottom: 0, marginTop: 18 }}>{project.note}</p>}
        </Panel>

        <div className="grid split">
          <Panel title="Money in vs money out">
            <FlowChart data={monthlyFlow(state, id)} />
          </Panel>

          <div className="stack">
            <Panel title="Expenditure by head">
              {heads.length === 0 ? (
                <Empty title="No bills yet">Record an expense to see the split.</Empty>
              ) : (
                <div className="bar-list">
                  {heads.map((h) => (
                    <div className="bar-row" key={h.id}>
                      <span style={{ fontWeight: 500 }}>{h.name}</span>
                      <span className="figure" style={{ fontSize: 12.5 }}>
                        {money(h.amount)}
                      </span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${h.share * 100}%`, background: '#e07f31' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title={isDone ? 'Left over from this job' : 'Material still on site'}
              action={
                <Link className="btn tiny" to="/inventory">
                  All stock
                </Link>
              }
              flush
            >
              {leftovers.length === 0 ? (
                <Empty title="Nothing left over">
                  Every stock-tracked item bought for this job has been used, moved to another job, or returned.
                </Empty>
              ) : (
                <>
                  <div style={{ padding: '14px 18px 0' }}>
                    <div className="measure-value as-text" style={{ color: 'var(--patina)', marginTop: 0, fontSize: 26 }}>
                      {money(stock.totalValue)}
                    </div>
                    <div className="measure-foot">
                      {isDone
                        ? 'This job is closed, so these are free to move to another project.'
                        : 'Still allocated to this job — some may yet be used.'}
                    </div>
                  </div>

                  <div className="table-wrap" style={{ marginTop: 12 }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th className="right">Left</th>
                          <th className="right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leftovers.map((l) => (
                          <tr key={l.id}>
                            <td>
                              {l.description || l.vendor}
                              <span className="sub-line">
                                {cameFrom(l)
                                  ? `${l.category} · moved here from ${cameFrom(l)}`
                                  : `${l.category} · bought ${num(l.qty)} ${l.unit}, used ${num(l.used)}`}
                              </span>
                            </td>
                            <td className="amount" style={{ fontWeight: 600 }}>
                              {num(l.left)} <span className="note">{l.unit}</span>
                            </td>
                            <td className="amount pos">{money(l.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>
          </div>
        </div>

        {advances.rows.length > 0 && (
          <Panel
            title="Money advanced for this job"
            action={
              <button className="btn tiny" onClick={() => setDialog({ kind: 'transfer' })}>
                Move money
              </button>
            }
            flush
          >
            <div style={{ padding: '14px 18px 0' }}>
              <p className="note" style={{ marginTop: 0 }}>
                Your own money moved between accounts so the buying could happen. Deliberately{' '}
                <strong>not counted</strong> in incoming or expenditure — the client did not pay it.
                {advances.net > 0 && ` ${money(advances.net)} is currently out with someone for this job.`}
              </p>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>From → To</th>
                    <th className="col-optional">Note</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.rows.map((t) => (
                    <tr key={t.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {shortDate(t.date)}
                      </td>
                      <td>
                        {t.fromName} <span className="note">→</span>{' '}
                        <strong style={{ fontWeight: 500 }}>{t.toName}</strong>
                      </td>
                      <td className="note col-optional">{t.note || t.reference || '—'}</td>
                      <td className={`amount ${t.isReturn ? 'pos' : ''}`}>
                        {t.isReturn ? 'returned ' : ''}
                        {money(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="3" style={{ textAlign: 'right' }}>
                      Still out with someone
                    </th>
                    <th className="amount" style={{ fontSize: 13 }}>
                      {money(advances.net)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        )}

        {accounts.length > 0 && (
          <Panel title="Which account paid" flush>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="right">Received here</th>
                    <th className="right">Spent from here</th>
                    <th className="right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>{a.name}</td>
                      <td className="amount">{money(a.inflow)}</td>
                      <td className="amount">{money(a.outflow)}</td>
                      <td className={`amount ${a.balance < 0 ? 'neg' : 'pos'}`}>{money(a.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <Panel title={`Documents · ${documents.length}`}>
          {documents.length === 0 ? (
            <Empty title="No documents filed yet">
              Attach the signed quotation to the project, and photograph each bill as you record it — everything
              filed against this job collects here.
            </Empty>
          ) : (
            <AttachmentGallery items={documents} />
          )}
        </Panel>

        <Panel
          title={`Full ledger · ${ledger.length} entries`}
          action={
            <>
              <button className="btn tiny" onClick={exportLedger} disabled={!ledger.length}>
                Export CSV
              </button>
              <button className="btn tiny danger" onClick={deleteProject}>
                Delete project
              </button>
            </>
          }
          flush
        >
          {ledger.length === 0 ? (
            <Empty
              title="Nothing recorded yet"
              action={
                <button className="btn primary" onClick={() => setDialog({ kind: 'receipt' })}>
                  Add the first receipt
                </button>
              }
            >
              Start with the client advance, then add bills as they come in.
            </Empty>
          ) : (
            <div className="table-wrap">
              {/* tap-rows: on a phone the Edit button is hidden and the row
                  itself opens the entry, freeing the width the amount needs. */}
              <table className="data tap-rows">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Head</th>
                    <th>Party / detail</th>
                    <th className="col-optional">Account</th>
                    <th className="right col-money">Amount</th>
                    <th className="col-optional" />
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      onClick={() => editEntry(row)}
                      title="Open this entry to edit it"
                    >
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        {shortDate(row.date)}
                      </td>
                      <td>
                        <span className={`chip ${row.kind === 'in' ? 'in' : 'out'}`}>{row.head}</span>
                      </td>
                      <td>
                        {row.party || '—'}
                        {row.detail && <span className="sub-line">{row.detail}</span>}
                      </td>
                      <td className="note col-optional">{row.account}</td>
                      <td className={`amount col-money ${row.kind === 'in' ? 'pos' : ''}`}>
                        {row.kind === 'in' ? '+' : '−'}
                        {money(row.amount)}
                      </td>
                      <td className="col-optional">
                        <div className="row-actions">
                          <button
                            className="btn ghost tiny"
                            onClick={(e) => {
                              // The row opens the editor too; don't do it twice.
                              e.stopPropagation()
                              editEntry(row)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn ghost tiny danger"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteEntry(row)
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
      </div>

      {dialog?.kind === 'receipt' && (
        <ReceiptDialog existing={dialog.row} lockedProject={id} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'expense' && (
        <ExpenseDialog existing={dialog.row} lockedProject={id} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'project' && <ProjectDialog existing={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'transfer' && <TransferDialog lockedProject={id} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'complete' && (
        <CompleteProjectDialog project={project} onClose={() => setDialog(null)} />
      )}
    </>
  )
}

function KV({ label, value, tone = '' }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`figure ${tone}`} style={{ fontSize: 18, marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}
