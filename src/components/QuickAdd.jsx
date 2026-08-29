import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import ReceiptDialog from './ReceiptDialog'
import ExpenseDialog from './ExpenseDialog'
import ProjectDialog from './ProjectDialog'
import TransferDialog from './TransferDialog'
import CompanyExpenseDialog from './CompanyExpenseDialog'
import { useApp } from '../store/AppStore'
import { useScope } from '../store/ScopeContext'

/**
 * The app's primary actions, reachable from every page. Previously each one
 * lived only on its own page, which made the read-only dashboard look like a
 * mockup — there was nothing to click on the first screen anyone sees.
 *
 * The company side gets its own pair rather than all six buttons: nothing over
 * there belongs to a project, so offering "New project" beside the electricity
 * bill would invite exactly the mix-up the two sides exist to prevent.
 */
export default function QuickAdd() {
  const { projects, accounts } = useApp()
  const { scope } = useScope()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(null)

  const locked = scope !== 'all' ? scope : null
  const hasProjects = projects.length > 0

  if (pathname.startsWith('/company')) {
    return (
      <>
        <div className="quick-add">
          <button
            className="btn"
            onClick={() => setOpen('transfer')}
            disabled={accounts.length < 2}
            title={accounts.length < 2 ? 'Needs at least two accounts' : 'Move money between your own accounts'}
          >
            Move money
          </button>
          <button className="btn primary" onClick={() => setOpen('company')}>
            Company expense
          </button>
        </div>

        {open === 'transfer' && <TransferDialog lockedProject={null} onClose={() => setOpen(null)} />}
        {open === 'company' && <CompanyExpenseDialog onClose={() => setOpen(null)} />}
      </>
    )
  }

  return (
    <>
      <div className="quick-add">
        <button
          className="btn"
          onClick={() => setOpen('receipt')}
          disabled={!hasProjects}
          title={hasProjects ? '' : 'Create a project first'}
        >
          Record receipt
        </button>
        <button
          className="btn"
          onClick={() => setOpen('expense')}
          disabled={!hasProjects}
          title={hasProjects ? '' : 'Create a project first'}
        >
          Record expense
        </button>
        <button
          className="btn"
          onClick={() => setOpen('transfer')}
          disabled={accounts.length < 2}
          title={accounts.length < 2 ? 'Needs at least two accounts' : 'Move money between your own accounts'}
        >
          Move money
        </button>
        <button className="btn primary" onClick={() => setOpen('project')}>
          New project
        </button>
      </div>

      {open === 'receipt' && <ReceiptDialog lockedProject={locked} onClose={() => setOpen(null)} />}
      {open === 'expense' && <ExpenseDialog lockedProject={locked} onClose={() => setOpen(null)} />}
      {open === 'transfer' && <TransferDialog lockedProject={locked} onClose={() => setOpen(null)} />}
      {open === 'project' && <ProjectDialog onClose={() => setOpen(null)} />}
    </>
  )
}
