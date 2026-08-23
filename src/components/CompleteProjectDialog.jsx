import { useMemo, useState } from 'react'
import Dialog from './Dialog'
import { useApp } from '../store/AppStore'
import { money, num } from '../lib/format'

/**
 * Closing a job is a stock-take, not a checkbox.
 *
 * This is the one moment someone actually walks the site and counts what is
 * left, so the dialog asks for those numbers instead of silently carrying
 * forward whatever was guessed when each bill was entered. Quantity left is
 * what gets typed, because that is what a person counts; used is derived.
 */
export default function CompleteProjectDialog({ project, onClose }) {
  const state = useApp()

  // Only heads that buy physical stock can have anything left over.
  const lines = useMemo(() => {
    const tracked = new Set(state.categories.filter((c) => c.tracksInventory).map((c) => c.id))
    const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))

    return state.expenses
      .filter((e) => e.projectId === project.id && tracked.has(e.categoryId))
      .map((e) => ({
        id: e.id,
        label: e.description || e.vendor || 'Unlabelled',
        category: catName[e.categoryId] ?? '—',
        vendor: e.vendor,
        unit: e.unit || '',
        qty: Number(e.qty) || 0,
        rate: Number(e.rate) || 0,
        currentLeft: Math.max((Number(e.qty) || 0) - (Number(e.usedQty) || 0), 0),
      }))
      .sort((a, b) => b.qty * b.rate - a.qty * a.rate)
  }, [state.expenses, state.categories, project.id])

  const [left, setLeft] = useState(() => Object.fromEntries(lines.map((l) => [l.id, String(l.currentLeft)])))
  const [error, setError] = useState('')

  const parsed = lines.map((l) => {
    const raw = left[l.id]
    const value = raw === '' ? 0 : Number(raw)
    const invalid = Number.isNaN(value) || value < 0 || value > l.qty
    return { ...l, leftQty: invalid ? l.currentLeft : value, invalid }
  })

  const totalValue = parsed.reduce((t, l) => t + l.leftQty * l.rate, 0)
  const anyInvalid = parsed.some((l) => l.invalid)

  const setAllUsed = () => setLeft(Object.fromEntries(lines.map((l) => [l.id, '0'])))
  const keepCurrent = () => setLeft(Object.fromEntries(lines.map((l) => [l.id, String(l.currentLeft)])))

  const submit = () => {
    if (anyInvalid) {
      return setError('A quantity left cannot be negative or more than what was bought.')
    }

    // Write back only what actually changed, so the audit trail stays honest.
    parsed.forEach((l) => {
      const usedQty = l.qty - l.leftQty
      const original = state.expenses.find((e) => e.id === l.id)
      if ((Number(original?.usedQty) || 0) !== usedQty) {
        state.update('expenses', { ...original, usedQty })
      }
    })

    state.update('projects', { ...project, status: 'Completed' })
    onClose()
  }

  return (
    <Dialog
      title="Close this job"
      subtitle={project.name}
      onClose={onClose}
      footer={
        <>
          {error ? (
            <span className="neg" style={{ fontSize: 12.5 }}>{error}</span>
          ) : (
            lines.length > 0 && (
              <span className="note">
                Left over:{' '}
                <strong className="figure" style={{ color: 'var(--patina)' }}>
                  {money(totalValue)}
                </strong>
              </span>
            )
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={anyInvalid}>
            Mark completed
          </button>
        </>
      }
    >
      <div className="dialog-body">
        {lines.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            Nothing stock-tracked was bought for this job, so there is no material to count. Marking it completed
            moves it out of your active list — you can reopen it at any time.
          </p>
        ) : (
          <>
            <p className="note" style={{ margin: 0 }}>
              Count what is physically left on site and enter it below. Whatever you don't list as left counts as
              used, and the surplus moves into your general stock pool for the next job.
            </p>

            <div className="tag-row">
              <button className="btn tiny" onClick={setAllUsed}>
                Nothing left — all used
              </button>
              <button className="btn tiny" onClick={keepCurrent}>
                Reset to recorded
              </button>
            </div>

            <div className="table-wrap stocktake">
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="right">Bought</th>
                    <th className="right">Left on site</th>
                    <th className="right">Used</th>
                    <th className="right">Value left</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className="tag-row">
                          <span className="chip out">{l.category}</span>
                          {l.label}
                        </span>
                        <span className="sub-line">
                          {l.vendor} · {money(l.rate)}/{l.unit || 'unit'}
                        </span>
                      </td>
                      <td className="amount">
                        {num(l.qty)} <span className="note">{l.unit}</span>
                      </td>
                      <td className="right">
                        <input
                          className="qty-input"
                          type="number"
                          min="0"
                          max={l.qty}
                          step="any"
                          value={left[l.id]}
                          aria-label={`Quantity of ${l.label} left on site`}
                          aria-invalid={l.invalid}
                          onChange={(e) => {
                            setError('')
                            setLeft((f) => ({ ...f, [l.id]: e.target.value }))
                          }}
                        />
                      </td>
                      <td className={`amount ${l.invalid ? 'neg' : 'note'}`}>
                        {l.invalid ? `0–${num(l.qty)}` : num(l.qty - l.leftQty)}
                      </td>
                      <td className="amount pos">{money(l.leftQty * l.rate)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="4" style={{ textAlign: 'right' }}>
                      Total left over
                    </th>
                    <th className="amount" style={{ fontSize: 13, color: 'var(--patina)' }}>
                      {money(totalValue)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
