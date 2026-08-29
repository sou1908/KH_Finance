// Masters are DATA, not code. v1 seeds them here and stores them alongside the
// ledger, so a user can add "Plumbing" or a third personal account without a
// deploy. Every id is a stable string — never renumber these.

export const ACCOUNT_KINDS = {
  CASH: 'cash',
  PERSONAL: 'personal',
  COMPANY: 'company',
}

export const DEFAULT_ACCOUNTS = [
  { id: 'acc_cash', name: 'Cash', kind: ACCOUNT_KINDS.CASH, holder: '', openingBalance: 0 },
  { id: 'acc_personal_a', name: 'Personal A/C — A', kind: ACCOUNT_KINDS.PERSONAL, holder: 'A', openingBalance: 0 },
  { id: 'acc_personal_b', name: 'Personal A/C — B', kind: ACCOUNT_KINDS.PERSONAL, holder: 'B', openingBalance: 0 },
  { id: 'acc_company', name: 'Company A/C', kind: ACCOUNT_KINDS.COMPANY, holder: 'Kalope Homes', openingBalance: 0 },
]

/**
 * A head is either a project head or a company head, and the two lists never
 * mix on screen: office rent must not be offerable on a client's bill, and
 * plywood is not a running cost.
 *
 * The test for which side something belongs on: if you would stop paying it the
 * day the job ends it is a project head; if you would still pay it with no jobs
 * running at all, it is a company head.
 */
export const CATEGORY_KINDS = {
  PROJECT: 'project',
  COMPANY: 'company',
}

// The seven heads from the site register. `tracksInventory` marks the ones that
// buy physical stock — only those roll up into Inventory Left.
export const DEFAULT_CATEGORIES = [
  { id: 'cat_sheet', name: 'Sheet', tracksInventory: true, unit: 'sheet', kind: 'project' },
  { id: 'cat_fare', name: 'Fare', tracksInventory: false, unit: 'trip', kind: 'project' },
  { id: 'cat_hardware', name: 'Hardware', tracksInventory: true, unit: 'pcs', kind: 'project' },
  { id: 'cat_labour', name: 'Labour', tracksInventory: false, unit: 'day', kind: 'project' },
  { id: 'cat_designer', name: 'Designer', tracksInventory: false, unit: 'job', kind: 'project' },
  { id: 'cat_electric', name: 'Electric', tracksInventory: true, unit: 'pcs', kind: 'project' },
  { id: 'cat_extra', name: 'Extra', tracksInventory: false, unit: 'item', kind: 'project' },

  // Running the business. Nothing here tracks inventory — none of it is
  // material that can be left over.
  { id: 'cat_co_rent', name: 'Rent', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_electricity', name: 'Electricity', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_internet', name: 'Internet & phone', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_marketing', name: 'Marketing & ads', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_software', name: 'Software & tools', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_travel', name: 'Travel & fuel', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_supplies', name: 'Office supplies', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_repairs', name: 'Repairs & upkeep', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_fees', name: 'Professional fees', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_bank', name: 'Bank charges', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_salary', name: 'Salary & wages', tracksInventory: false, unit: '', kind: 'company' },
  { id: 'cat_co_other', name: 'Other', tracksInventory: false, unit: '', kind: 'company' },
]

export const PROJECT_STATUS = ['Active', 'On hold', 'Completed']
