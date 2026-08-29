import Panel, { Empty } from './Panel'
import { vendorsOfKind } from '../store/selectors'

/**
 * Whoever gets paid, on one side of the business.
 *
 * Two lists rather than one, for the same reason the heads are split: a plywood
 * shop has no business in the dropdown on an electricity bill, and the landlord
 * has none on a client's. A vendor who genuinely serves both sides is saved on
 * both — the list is a typing aid, and the bill records the name it was given,
 * so nothing downstream depends on there being one row.
 */
export default function VendorsPanel({ state, setDialog, side }) {
  const company = side === 'company'
  const kind = company ? 'companyVendor' : 'vendor'
  const vendors = vendorsOfKind(state, company ? 'company' : 'project')

  // Bills store the name, not a reference, so past use is counted by name.
  const bills = company ? state.companyExpenses : state.expenses

  return (
    <Panel
      title={company ? 'Who you pay' : 'Vendors'}
      action={
        <button className="btn tiny" onClick={() => setDialog({ kind })}>
          Add {company ? 'payee' : 'vendor'}
        </button>
      }
      flush
    >
      {vendors.length === 0 ? (
        <Empty
          title={company ? 'Nobody saved yet' : 'No vendors saved yet'}
          action={
            <button className="btn primary" onClick={() => setDialog({ kind })}>
              Add the first one
            </button>
          }
        >
          {company
            ? 'Landlords, the power company, the internet provider, agencies — save them once and each becomes a dropdown when recording a company bill.'
            : 'Save the shops and contractors you buy from and their names become a dropdown when recording a bill — typed once, spelled the same way every time.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{company ? 'Paid to' : 'Vendor'}</th>
                <th className="col-optional">Phone</th>
                <th className="col-optional">Note</th>
                <th className="right">Bills</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const count = bills.filter((e) => e.vendor === v.name).length
                return (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 500 }}>{v.name}</td>
                    <td className="num col-optional">{v.phone || '—'}</td>
                    <td className="note col-optional">{v.note || '—'}</td>
                    <td className="amount">{count}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost tiny" onClick={() => setDialog({ kind, row: v })}>
                          Edit
                        </button>
                        <button
                          className="btn ghost tiny danger"
                          title="Removing them leaves past bills untouched"
                          onClick={() =>
                            window.confirm(
                              `Remove ${v.name} from the list?\n\nBills already recorded against them are not affected.`,
                            ) && state.remove('vendors', v.id)
                          }
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
  )
}
