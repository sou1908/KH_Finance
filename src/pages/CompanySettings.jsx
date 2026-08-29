import { useState } from 'react'
import Panel, { Empty } from '../components/Panel'
import MasterDialog from '../components/MasterDialog'
import VendorsPanel from '../components/VendorsPanel'
import SharedSetup from '../components/SharedSetup'
import { useApp } from '../store/AppStore'
import { headsOfKind } from '../store/selectors'
import { money } from '../lib/format'

/**
 * Setup for the company side: its own heads, its own payees, its own offices.
 *
 * Kept apart from the project settings rather than sharing one long page. The
 * two lists of heads and the two lists of vendors are what stop office rent
 * being offerable on a client's bill, and a page that showed both together
 * would make that separation look accidental instead of deliberate.
 */
export default function CompanySettings() {
  const state = useApp()
  const [dialog, setDialog] = useState(null)

  const heads = headsOfKind(state, 'company')

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Company · Setup</span>
          <h1>Company settings</h1>
          <div className="crumb">
            Heads, payees and offices for what the business costs to run. Job heads live under Project settings.
          </div>
        </div>
      </div>

      <div className="stack">
        <Panel
          title="Company heads"
          action={
            <button className="btn tiny" onClick={() => setDialog({ kind: 'companyHead' })}>
              Add head
            </button>
          }
          flush
        >
          {heads.length === 0 ? (
            <Empty
              title="No company heads yet"
              action={
                <button className="btn primary" onClick={() => setDialog({ kind: 'companyHead' })}>
                  Add the first one
                </button>
              }
            >
              These are what the business costs to run — rent, electricity, internet, marketing. The test: if you
              would still pay it with no jobs running, it belongs here rather than under a project head.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Head</th>
                    <th className="right">Bills filed</th>
                    <th className="right col-optional">Total spent</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {heads.map((c) => {
                    const rows = state.companyExpenses.filter((e) => e.categoryId === c.id)
                    const spent = rows.reduce((t, e) => t + (Number(e.amount) || 0), 0)
                    return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{c.name}</td>
                        <td className="amount">{rows.length}</td>
                        <td className="amount col-optional">{spent ? money(spent) : '—'}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn ghost tiny"
                              onClick={() => setDialog({ kind: 'companyHead', row: c })}
                            >
                              Edit
                            </button>
                            <button
                              className="btn ghost tiny danger"
                              disabled={rows.length > 0}
                              title={
                                rows.length > 0
                                  ? `${rows.length} bill${rows.length === 1 ? '' : 's'} are filed under this head. Reassign them first.`
                                  : 'Remove this head'
                              }
                              onClick={() => state.remove('categories', c.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <VendorsPanel state={state} setDialog={setDialog} side="company" />

        {/*
          Nothing is seeded here. An invented office name is indistinguishable
          from a real one after a week, and a cost filed against the wrong
          premises is worse than one filed against none.
        */}
        <Panel
          title="Offices"
          action={
            <button className="btn tiny" onClick={() => setDialog({ kind: 'office' })}>
              Add office
            </button>
          }
          flush
        >
          {state.offices.length === 0 ? (
            <Empty
              title="No offices set up"
              action={
                <button className="btn primary" onClick={() => setDialog({ kind: 'office' })}>
                  Add your first office
                </button>
              }
            >
              Add each premises and every company bill can be charged to one, so you can see what each is costing
              you. Costs that belong to no single office — an ad campaign, a software licence — stay marked
              company-wide.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Office</th>
                    <th className="col-optional">Address</th>
                    <th className="right">Bills filed</th>
                    <th className="right col-optional">Total spent</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.offices.map((o) => {
                    const rows = state.companyExpenses.filter((e) => e.officeId === o.id)
                    const spent = rows.reduce((t, e) => t + (Number(e.amount) || 0), 0)
                    return (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 500 }}>{o.name}</td>
                        <td className="note col-optional">{o.address || '—'}</td>
                        <td className="amount">{rows.length}</td>
                        <td className="amount col-optional">{spent ? money(spent) : '—'}</td>
                        <td>
                          <div className="row-actions">
                            <button className="btn ghost tiny" onClick={() => setDialog({ kind: 'office', row: o })}>
                              Edit
                            </button>
                            <button
                              className="btn ghost tiny danger"
                              disabled={rows.length > 0}
                              title={
                                rows.length > 0
                                  ? `${rows.length} bill${rows.length === 1 ? '' : 's'} are charged to this office. Reassign them first.`
                                  : 'Remove this office'
                              }
                              onClick={() => state.remove('offices', o.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <SharedSetup setDialog={setDialog} />
      </div>

      {dialog && (
        <MasterDialog
          kind={dialog.kind}
          row={dialog.row}
          presets={dialog.presets}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}
