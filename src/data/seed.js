import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './masters'

// A worked example so the app is never a blank page on first open.
// Everything here is demo data — "Reset demo data" in Settings wipes it.

export function seedState() {
  const p1 = 'prj_demo_kothari'
  const p2 = 'prj_demo_vaidya'

  return {
    accounts: DEFAULT_ACCOUNTS,
    categories: DEFAULT_CATEGORIES,
    clients: [
      { id: 'cli_kothari', name: 'R. Kothari', phone: '98200 11223', note: '3BHK, Andheri West' },
      { id: 'cli_vaidya', name: 'S. Vaidya', phone: '98330 44556', note: 'Duplex, Thane' },
    ],
    projects: [
      {
        id: p1,
        name: 'Kothari Residence — 3BHK',
        clientId: 'cli_kothari',
        // Left blank on purpose: this one falls back to the client's number.
        phone: '',
        site: 'Andheri West, Mumbai',
        quotedAmount: 1450000,
        startDate: '2026-04-08',
        status: 'Active',
        note: 'Full interior. Modular kitchen + 2 wardrobes.',
      },
      {
        id: p2,
        name: 'Vaidya Duplex — Fit-out',
        clientId: 'cli_vaidya',
        // A site contact of its own, different from the client's number.
        phone: '+91 99300 22114',
        site: 'Ghodbunder Road, Thane',
        quotedAmount: 880000,
        startDate: '2026-06-02',
        status: 'Active',
        note: 'Ground + first floor false ceiling and furniture.',
      },
    ],
    receipts: [
      { id: 'rcp_1', projectId: p1, date: '2026-04-10', amount: 400000, accountId: 'acc_company', mode: 'NEFT', reference: 'HDFC/8811', note: 'Advance 30%' },
      { id: 'rcp_2', projectId: p1, date: '2026-05-14', amount: 250000, accountId: 'acc_personal_a', mode: 'UPI', reference: 'UPI/44219', note: 'Stage 2' },
      { id: 'rcp_3', projectId: p1, date: '2026-06-21', amount: 120000, accountId: 'acc_cash', mode: 'Cash', reference: '', note: 'Site hand cash' },
      { id: 'rcp_4', projectId: p2, date: '2026-06-05', amount: 300000, accountId: 'acc_company', mode: 'NEFT', reference: 'HDFC/9042', note: 'Advance' },
      { id: 'rcp_5', projectId: p2, date: '2026-07-19', amount: 150000, accountId: 'acc_personal_b', mode: 'UPI', reference: 'UPI/51170', note: 'Stage 2' },
    ],
    expenses: [
      { id: 'exp_1', projectId: p1, date: '2026-04-12', categoryId: 'cat_sheet', accountId: 'acc_company', vendor: 'Shree Ply Mart', description: '19mm BWP plywood', qty: 42, unit: 'sheet', rate: 3150, amount: 132300, billNo: 'SPM/1188', usedQty: 36 },
      { id: 'exp_2', projectId: p1, date: '2026-04-12', categoryId: 'cat_fare', accountId: 'acc_cash', vendor: 'Tempo — Ashok', description: 'Ply delivery to site', qty: 2, unit: 'trip', rate: 1400, amount: 2800, billNo: '', usedQty: 0 },
      { id: 'exp_3', projectId: p1, date: '2026-04-26', categoryId: 'cat_hardware', accountId: 'acc_company', vendor: 'Hettich Dealer', description: 'Soft-close hinges + channels', qty: 180, unit: 'pcs', rate: 340, amount: 61200, billNo: 'HD/4407', usedQty: 152 },
      { id: 'exp_4', projectId: p1, date: '2026-05-03', categoryId: 'cat_labour', accountId: 'acc_cash', vendor: 'Rafiq carpentry team', description: 'Carpentry — 6 men × 12 days', qty: 72, unit: 'day', rate: 900, amount: 64800, billNo: '', usedQty: 0 },
      { id: 'exp_5', projectId: p1, date: '2026-05-18', categoryId: 'cat_electric', accountId: 'acc_personal_a', vendor: 'Anchor Point', description: 'Switches, wire, profile lights', qty: 210, unit: 'pcs', rate: 285, amount: 59850, billNo: 'AP/2231', usedQty: 190 },
      { id: 'exp_6', projectId: p1, date: '2026-06-02', categoryId: 'cat_designer', accountId: 'acc_company', vendor: 'Studio Meher', description: '3D views + working drawings', qty: 1, unit: 'job', rate: 45000, amount: 45000, billNo: 'SM/07', usedQty: 0 },
      { id: 'exp_7', projectId: p1, date: '2026-06-24', categoryId: 'cat_extra', accountId: 'acc_cash', vendor: 'Site misc.', description: 'Tea, consumables, touch-up', qty: 1, unit: 'item', rate: 9400, amount: 9400, billNo: '', usedQty: 0 },
      { id: 'exp_8', projectId: p2, date: '2026-06-08', categoryId: 'cat_sheet', accountId: 'acc_company', vendor: 'Shree Ply Mart', description: '12mm ply + laminate', qty: 28, unit: 'sheet', rate: 2650, amount: 74200, billNo: 'SPM/1240', usedQty: 21 },
      { id: 'exp_9', projectId: p2, date: '2026-06-15', categoryId: 'cat_labour', accountId: 'acc_cash', vendor: 'Salim ceiling team', description: 'False ceiling — 8 men × 9 days', qty: 72, unit: 'day', rate: 850, amount: 61200, billNo: '', usedQty: 0 },
      { id: 'exp_10', projectId: p2, date: '2026-07-01', categoryId: 'cat_hardware', accountId: 'acc_personal_b', vendor: 'Ebco Dealer', description: 'Handles, locks, brackets', qty: 96, unit: 'pcs', rate: 410, amount: 39360, billNo: 'EB/881', usedQty: 74 },
      { id: 'exp_11', projectId: p2, date: '2026-07-22', categoryId: 'cat_fare', accountId: 'acc_cash', vendor: 'Tempo — Ashok', description: 'Material runs', qty: 3, unit: 'trip', rate: 1200, amount: 3600, billNo: '', usedQty: 0 },
    ],
  }
}
