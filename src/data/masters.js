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

// The seven heads from the site register. `tracksInventory` marks the ones that
// buy physical stock — only those roll up into Inventory Left.
export const DEFAULT_CATEGORIES = [
  { id: 'cat_sheet', name: 'Sheet', tracksInventory: true, unit: 'sheet' },
  { id: 'cat_fare', name: 'Fare', tracksInventory: false, unit: 'trip' },
  { id: 'cat_hardware', name: 'Hardware', tracksInventory: true, unit: 'pcs' },
  { id: 'cat_labour', name: 'Labour', tracksInventory: false, unit: 'day' },
  { id: 'cat_designer', name: 'Designer', tracksInventory: false, unit: 'job' },
  { id: 'cat_electric', name: 'Electric', tracksInventory: true, unit: 'pcs' },
  { id: 'cat_extra', name: 'Extra', tracksInventory: false, unit: 'item' },
]

export const PROJECT_STATUS = ['Active', 'On hold', 'Completed']
