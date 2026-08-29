// Every rupee calculation in the app lives here. Components read, never compute.
// When the numbers are ever questioned, this is the only file to audit.

const sum = (rows, pick = (r) => r.amount) => rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0)

export function byProject(rows, projectId) {
  return projectId === 'all' || !projectId ? rows : rows.filter((r) => r.projectId === projectId)
}

/* ---------------------------------------------------------------- periods --

   A date as the local calendar sees it.

   `toISOString()` converts to UTC first, so in IST (+5:30) local midnight on
   1 April is 31 March 18:30 UTC and the month would start a day early. Every
   date in the ledger is a plain calendar date, so it is formatted as one.      */

const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The periods the reports offer.
 *
 * The financial year runs April to March, which is the year this business is
 * actually assessed on — a January-to-December "year" would not match a single
 * document their accountant produces.
 */
export function periodRange(key, today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth()
  const monthLabel = (yy, mm) => `${MONTHS[mm]} ${String(yy).slice(2)}`

  switch (key) {
    case 'this-month':
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)), label: monthLabel(y, m) }

    case 'last-month':
      return {
        from: isoDate(new Date(y, m - 1, 1)),
        to: isoDate(new Date(y, m, 0)),
        label: monthLabel(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1),
      }

    case 'fy': {
      // April onward belongs to the year that just started; Jan–Mar still
      // belongs to the one that began last April.
      const startYear = m >= 3 ? y : y - 1
      return {
        from: isoDate(new Date(startYear, 3, 1)),
        to: isoDate(new Date(startYear + 1, 2, 31)),
        label: `FY ${startYear}–${String(startYear + 1).slice(2)}`,
      }
    }

    default:
      return { from: '', to: '', label: 'All time' }
  }
}

export const PERIODS = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'fy', label: 'Financial year' },
  { key: 'all', label: 'All time' },
]

/** Dates are ISO strings, so a string compare is a date compare. */
export function inPeriod(date, range) {
  if (!range || (!range.from && !range.to)) return true
  const d = String(date ?? '')
  if (!d) return false
  if (range.from && d < range.from) return false
  if (range.to && d > range.to) return false
  return true
}

const withinPeriod = (rows, range) => (range ? rows.filter((r) => inPeriod(r.date, range)) : rows)

/**
 * The core statement. `remaining` is what the sketch calls "how much is saved":
 * money received minus money spent. Negative means the project is running on
 * the firm's own money and needs a payment call.
 */
/**
 * What material moving between jobs is worth, valued at what was paid for it.
 *
 * The bill is never rewritten: 50 sheets for 157,500 stays 50 sheets for
 * 157,500, because that is what the paper in the file says and rewriting it is
 * exactly what compliance asks you not to do. The correction sits alongside it
 * as a derived figure instead — nothing negative in the ledger, nothing to
 * reconcile by hand.
 *
 * A movement is valued at the rate of the purchase it came from, even after it
 * has been moved twice, because that is the money that actually left.
 */
export function materialTransfers(state, projectId) {
  const rateFor = Object.fromEntries(state.expenses.map((e) => [e.id, Number(e.rate) || 0]))

  const moves = (state.movements ?? []).filter((m) => m.type === 'moved')
  const value = (m) => (Number(m.qty) || 0) * (rateFor[m.expenseId] ?? 0)

  if (projectId === 'all' || !projectId) {
    // Across everything, what leaves one job arrives at another, so it nets to
    // zero and the firm's total spend is unchanged.
    return { out: 0, in: 0, net: 0, movedOut: [], movedIn: [] }
  }

  const movedOut = moves.filter((m) => m.fromProjectId === projectId)
  const movedIn = moves.filter((m) => m.toProjectId === projectId)

  const out = sum(movedOut, value)
  const into = sum(movedIn, value)

  return { out, in: into, net: into - out, movedOut, movedIn }
}

export function projectTotals(state, projectId) {
  const receipts = byProject(state.receipts, projectId)
  const expenses = byProject(state.expenses, projectId)

  const incoming = sum(receipts)
  const expenditure = sum(expenses)
  const remaining = incoming - expenditure

  const projects = projectId === 'all' ? state.projects : state.projects.filter((p) => p.id === projectId)
  const quoted = sum(projects, (p) => p.quotedAmount)

  // Material bought on this job and sent elsewhere was never consumed here;
  // material received from another job was. Adding the two to what was billed
  // gives what the job really cost.
  const transfers = materialTransfers(state, projectId)
  const netCost = expenditure + transfers.net

  return {
    incoming,
    // As billed. Ties to the paper, and is never adjusted.
    expenditure,
    remaining,
    quoted,

    // The allocation layer, kept separate so both figures stay visible.
    materialOut: transfers.out,
    materialIn: transfers.in,
    materialNet: transfers.net,
    hasTransfers: transfers.out > 0 || transfers.in > 0,
    // What this job actually consumed.
    netCost,

    // How much of the quote is still uninvoiced/uncollected.
    pendingFromClient: Math.max(quoted - incoming, 0),
    // Share of received money already spent — drives the caliper scale.
    burnRatio: incoming > 0 ? expenditure / incoming : 0,
    // Measured against what the job consumed, not what was billed to it, or a
    // job that lent out material would look worse than it performed.
    quoteRatio: quoted > 0 ? netCost / quoted : 0,
    margin: quoted - netCost,

    receiptCount: receipts.length,
    expenseCount: expenses.length,
  }
}

/** Expenditure split by head, biggest first, with percentage of total spend. */
export function categoryBreakdown(state, projectId) {
  const expenses = byProject(state.expenses, projectId)
  const total = sum(expenses)

  // Project heads only. Company heads can never carry a project bill, so
  // including them would pad every "heads in use" count with rows fixed at zero.
  return state.categories
    .filter((c) => (c.kind || 'project') === 'project')
    .map((cat) => {
      const rows = expenses.filter((e) => e.categoryId === cat.id)
      const amount = sum(rows)
      return {
        ...cat,
        amount,
        count: rows.length,
        share: total > 0 ? amount / total : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Per-account movement. This is what reconciles the three inflow channels
 * against real spending — cash in hand, each partner's personal account, and
 * the company account are all tracked separately.
 *
 * Transfers count here and ONLY here. Moving money between your own accounts
 * changes what is in each pocket; it is not income and it is not spending, so
 * it must never reach projectTotals.
 */
export function accountLedger(state, projectId) {
  const receipts = byProject(state.receipts, projectId)
  const expenses = byProject(state.expenses, projectId)
  const transfers = byProject(state.transfers ?? [], projectId)

  // Company costs belong to no project, so they only count when looking at
  // everything. Scoped to one job, office rent is simply not that job's money.
  const wholeFirm = projectId === 'all' || !projectId
  const company = wholeFirm ? state.companyExpenses ?? [] : []

  return state.accounts.map((acc) => {
    const inRows = receipts.filter((r) => r.accountId === acc.id)
    const outRows = expenses.filter((e) => e.accountId === acc.id)
    const companyRows = company.filter((c) => c.accountId === acc.id)
    const movedIn = transfers.filter((t) => t.toAccountId === acc.id)
    const movedOut = transfers.filter((t) => t.fromAccountId === acc.id)

    const inflow = sum(inRows)
    const outflow = sum(outRows)
    const companyOutflow = sum(companyRows)
    const transferIn = sum(movedIn)
    const transferOut = sum(movedOut)

    // An opening balance is a position, not a project's money, so it only
    // applies when looking at everything.
    const opening = wholeFirm ? Number(acc.openingBalance) || 0 : 0

    return {
      ...acc,
      inflow,
      outflow,
      companyOutflow,
      transferIn,
      transferOut,
      opening,
      balance: opening + inflow + transferIn - outflow - companyOutflow - transferOut,
      movements:
        inRows.length + outRows.length + companyRows.length + movedIn.length + movedOut.length,
    }
  })
}

/**
 * Money in hand: every account added up.
 *
 * The one number the whole app hangs off, and the only one that is true without
 * qualification — it is what the firm can actually spend tomorrow. It is not
 * profit, and the reports are careful never to call it that.
 */
export function moneyInHand(state) {
  const rows = accountLedger(state, 'all')
  return {
    total: rows.reduce((t, a) => t + a.balance, 0),
    accounts: rows,
    negative: rows.filter((a) => a.balance < 0),
  }
}

/**
 * Money the firm is genuinely out of pocket for: the accounts sitting below
 * zero. Before transfers existed this was measured as "spent more than it
 * received", which counted every rupee a partner spent even when the company
 * had funded it the day before.
 */
export function ownMoneyAtRisk(rows, kind = 'personal') {
  return rows
    .filter((a) => (kind ? a.kind === kind : true))
    .reduce((total, a) => total + Math.max(-a.balance, 0), 0)
}

/**
 * Transfers earmarked for a project.
 *
 * The link records why the money moved — "advanced to A for the Kothari job" —
 * so an advance can be chased at close. It is intent, not income: none of this
 * touches what the project has earned or spent.
 */
export function projectAdvances(state, projectId) {
  const accountName = Object.fromEntries(state.accounts.map((a) => [a.id, a.name]))
  const accountKind = Object.fromEntries(state.accounts.map((a) => [a.id, a.kind]))

  const rows = byProject(state.transfers ?? [], projectId)
    .map((t) => ({
      ...t,
      amount: Number(t.amount) || 0,
      fromName: accountName[t.fromAccountId] ?? 'Unknown account',
      toName: accountName[t.toAccountId] ?? 'Unknown account',
      // Company money going out to a person is an advance; the reverse is a
      // return of one.
      isReturn: accountKind[t.toAccountId] === 'company' && accountKind[t.fromAccountId] !== 'company',
    }))
    .sort((a, b) => (a.date === b.date ? 0 : b.date.localeCompare(a.date)))

  const advanced = sum(rows.filter((r) => !r.isReturn))
  const returned = sum(rows.filter((r) => r.isReturn))

  return { rows, advanced, returned, net: advanced - returned }
}

/** Every transfer, newest first, with names resolved. For the Accounts page. */
export function transferLedger(state, projectId) {
  const accountName = Object.fromEntries(state.accounts.map((a) => [a.id, a.name]))
  const projectName = Object.fromEntries(state.projects.map((p) => [p.id, p.name]))

  return byProject(state.transfers ?? [], projectId)
    .map((t) => ({
      ...t,
      amount: Number(t.amount) || 0,
      fromName: accountName[t.fromAccountId] ?? 'Unknown account',
      toName: accountName[t.toAccountId] ?? 'Unknown account',
      projectName: t.projectId ? (projectName[t.projectId] ?? 'Unknown project') : '',
    }))
    .sort((a, b) => (a.date === b.date ? 0 : b.date.localeCompare(a.date)))
}

/**
 * Where a purchase line's material currently stands, project by project.
 *
 * A line starts wholly at the project it was bought for. Movements then walk
 * quantities around: used at a site, moved to another job, returned to the
 * vendor. That is why leftovers can be re-used elsewhere without inventing a
 * second purchase — the quantity travels, the money stays where it was spent.
 *
 * Lines recorded before movements existed carry their old single `usedQty`
 * instead. The server backfills those into real movements on first boot; this
 * fallback covers the local-only mode, which has no server to do it.
 */
export function materialPosition(state, expense) {
  const moves = (state.movements ?? []).filter((m) => m.expenseId === expense.id)
  const qty = Number(expense.qty) || 0

  if (moves.length === 0) {
    const used = Math.min(Number(expense.usedQty) || 0, qty)
    return {
      moves: [],
      used,
      movedOut: 0,
      movedIn: 0,
      returned: 0,
      leftAtOrigin: qty - used,
      byProject: { [expense.projectId]: qty - used },
    }
  }

  const total = (type, pick) => sum(moves.filter((m) => m.type === type), pick)

  const used = total('used', (m) => m.qty)
  const returned = total('returned', (m) => m.qty)
  const movedOut = sum(
    moves.filter((m) => m.type === 'moved' && m.fromProjectId === expense.projectId),
    (m) => m.qty,
  )

  // Everything is tracked per project, so material sent to another job shows up
  // as stock there rather than vanishing.
  const byProject = {}
  byProject[expense.projectId] = qty

  for (const m of moves) {
    const amount = Number(m.qty) || 0
    if (m.type === 'moved') {
      byProject[m.fromProjectId] = (byProject[m.fromProjectId] ?? 0) - amount
      if (m.toProjectId) byProject[m.toProjectId] = (byProject[m.toProjectId] ?? 0) + amount
    } else {
      // used or returned: leaves the pool from wherever it was
      byProject[m.fromProjectId] = (byProject[m.fromProjectId] ?? 0) - amount
    }
  }

  return {
    moves,
    used,
    returned,
    movedOut,
    movedIn: 0,
    leftAtOrigin: byProject[expense.projectId] ?? 0,
    byProject,
  }
}

/**
 * Inventory Left = what was bought minus what has left the pool, for the heads
 * flagged `tracksInventory`. Value is carried at the purchase rate, so it can
 * be moved to another project instead of written off.
 */
export function inventoryLeft(state, projectId) {
  const tracked = new Set(state.categories.filter((c) => c.tracksInventory).map((c) => c.id))
  const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))

  // Every stock-tracked purchase, wherever its material was bought for, because
  // a line bought for one job can now be holding stock at another.
  const lines = state.expenses
    .filter((e) => tracked.has(e.categoryId))
    .map((e) => {
      const qty = Number(e.qty) || 0
      const rate = Number(e.rate) || 0
      const position = materialPosition(state, e)

      // Looking at one project asks what is standing there; looking at
      // everything asks what is still ours anywhere.
      const left =
        projectId === 'all' || !projectId
          ? Object.values(position.byProject).reduce((t, n) => t + n, 0)
          : (position.byProject[projectId] ?? 0)

      return {
        id: e.id,
        projectId: e.projectId,
        date: e.date,
        category: catName[e.categoryId] ?? '—',
        description: e.description || e.vendor,
        vendor: e.vendor,
        unit: e.unit,
        qty,
        used: position.used,
        movedOut: position.movedOut,
        returned: position.returned,
        left,
        // Where this material is sitting right now, for the origin project to
        // show that some of it went elsewhere.
        byProject: position.byProject,
        rate,
        value: left * rate,
        consumedPct: qty > 0 ? position.used / qty : 0,
      }
    })
    // A line only belongs to a project view if something of it is standing
    // there, or it was bought there in the first place.
    .filter((l) =>
      projectId === 'all' || !projectId ? true : l.projectId === projectId || (l.byProject[projectId] ?? 0) > 0,
    )
    .sort((a, b) => b.value - a.value)

  return { lines, totalValue: sum(lines, (l) => l.value) }
}

/**
 * What a purchase line still has outstanding, for the procurement screen.
 * Money never appears here — this is the view a procurement account gets.
 */
export function outstandingMaterial(state, projectId) {
  const tracked = new Set(state.categories.filter((c) => c.tracksInventory).map((c) => c.id))
  const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))
  const projectName = Object.fromEntries(state.projects.map((p) => [p.id, p.name]))

  const lines = state.expenses
    .filter((e) => tracked.has(e.categoryId))
    .flatMap((e) => {
      const position = materialPosition(state, e)

      // One row per place this material is standing, so moved stock shows up
      // under the job it was sent to.
      return Object.entries(position.byProject)
        .filter(([, qty]) => qty > 0.0001)
        .map(([holdingProjectId, left]) => ({
          key: `${e.id}:${holdingProjectId}`,
          expenseId: e.id,
          projectId: holdingProjectId,
          projectName: projectName[holdingProjectId] ?? 'Unknown project',
          boughtFor: e.projectId,
          isElsewhere: holdingProjectId !== e.projectId,
          date: e.date,
          category: catName[e.categoryId] ?? '—',
          description: e.description || e.vendor,
          vendor: e.vendor,
          unit: e.unit,
          qty: Number(e.qty) || 0,
          used: position.used,
          left,
        }))
    })
    .filter((l) => (projectId === 'all' || !projectId ? true : l.projectId === projectId))
    .sort((a, b) => (a.projectName === b.projectName ? b.left - a.left : a.projectName.localeCompare(b.projectName)))

  return { lines, totalLeft: sum(lines, (l) => l.left) }
}

/** Every movement against one purchase line, newest first, with names filled in. */
export function movementHistory(state, expenseId) {
  const projectName = Object.fromEntries(state.projects.map((p) => [p.id, p.name]))

  return (state.movements ?? [])
    .filter((m) => m.expenseId === expenseId)
    .map((m) => ({
      ...m,
      qty: Number(m.qty) || 0,
      fromName: projectName[m.fromProjectId] ?? '—',
      toName: m.toProjectId ? (projectName[m.toProjectId] ?? 'Unknown project') : '',
    }))
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))
}

/**
 * Everything left over, pooled across every project and grouped by item.
 *
 * Per-project leftovers answer "what's still on this site". They do NOT answer
 * the question that actually saves money — "do we already own this?" Six sheets
 * left on one job and three on another is nine sheets you needn't buy, and no
 * per-project view will ever tell you that.
 *
 * Items are matched on head + description + unit, case-insensitively. That is a
 * heuristic: "19mm BWP ply" and "19mm B.W.P. plywood" stay separate until
 * someone types them the same way.
 */
export function stockPool(state) {
  const projectById = Object.fromEntries(state.projects.map((p) => [p.id, p]))
  const { lines } = inventoryLeft(state, 'all')

  const groups = new Map()

  for (const line of lines) {
    if (line.left <= 0) continue

    const label = (line.description || line.vendor || 'Unlabelled').trim()
    const key = [line.category, label.toLowerCase(), (line.unit || '').toLowerCase()].join('|')
    const project = projectById[line.projectId]
    // Material on a finished job is genuinely free to move. Material on a live
    // job may still get used, so the two must not be added together blindly.
    const released = project?.status === 'Completed'

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        category: line.category,
        description: label,
        unit: line.unit,
        qty: 0,
        value: 0,
        releasedQty: 0,
        releasedValue: 0,
        committedQty: 0,
        sources: [],
      })
    }

    const group = groups.get(key)
    group.qty += line.left
    group.value += line.value
    if (released) {
      group.releasedQty += line.left
      group.releasedValue += line.value
    } else {
      group.committedQty += line.left
    }

    group.sources.push({
      projectId: line.projectId,
      projectName: project?.name ?? 'Unknown project',
      status: project?.status ?? 'Active',
      released,
      qty: line.left,
      value: line.value,
      rate: line.rate,
      date: line.date,
    })
  }

  const items = [...groups.values()]
    .map((g) => ({ ...g, sources: g.sources.sort((a, b) => b.qty - a.qty), rate: g.qty ? g.value / g.qty : 0 }))
    .sort((a, b) => b.value - a.value)

  return {
    items,
    totalValue: sum(items, (i) => i.value),
    releasedValue: sum(items, (i) => i.releasedValue),
    committedValue: sum(items, (i) => i.value - i.releasedValue),
    // Worth flagging: the same item sitting in more than one place.
    splitAcrossProjects: items.filter((i) => new Set(i.sources.map((s) => s.projectId)).size > 1).length,
  }
}

/** Month-by-month in vs out, oldest first — feeds the flow chart. */
export function monthlyFlow(state, projectId) {
  const buckets = new Map()

  const put = (date, key, amount) => {
    const month = (date || '').slice(0, 7)
    if (!month) return
    if (!buckets.has(month)) buckets.set(month, { month, incoming: 0, expenditure: 0 })
    buckets.get(month)[key] += Number(amount) || 0
  }

  byProject(state.receipts, projectId).forEach((r) => put(r.date, 'incoming', r.amount))
  byProject(state.expenses, projectId).forEach((e) => put(e.date, 'expenditure', e.amount))

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/** Receipts and expenses merged into one date-sorted ledger, newest first. */
export function combinedLedger(state, projectId, limit) {
  const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))
  const accName = Object.fromEntries(state.accounts.map((a) => [a.id, a.name]))

  const rows = [
    ...byProject(state.receipts, projectId).map((r) => ({
      id: r.id,
      kind: 'in',
      date: r.date,
      head: 'Payment received',
      party: r.mode || 'Receipt',
      detail: r.note || r.reference || '',
      account: accName[r.accountId] ?? '—',
      amount: Number(r.amount) || 0,
    })),
    ...byProject(state.expenses, projectId).map((e) => ({
      id: e.id,
      kind: 'out',
      date: e.date,
      head: catName[e.categoryId] ?? '—',
      party: e.vendor,
      detail: e.description || '',
      account: accName[e.accountId] ?? '—',
      amount: Number(e.amount) || 0,
    })),
    // Company bills belong to no project, so they only appear when looking at
    // everything. Leaving them out entirely would let a page headed "every
    // movement" quietly omit the rent.
    ...(projectId === 'all' || !projectId ? state.companyExpenses ?? [] : []).map((e) => ({
      id: e.id,
      kind: 'out',
      company: true,
      date: e.date,
      head: catName[e.categoryId] ?? '—',
      party: e.vendor,
      detail: e.description || '',
      account: accName[e.accountId] ?? '—',
      amount: Number(e.amount) || 0,
    })),
  ].sort((a, b) => (a.date === b.date ? b.amount - a.amount : b.date.localeCompare(a.date)))

  return limit ? rows.slice(0, limit) : rows
}

export function projectSummaries(state) {
  const clientName = Object.fromEntries(state.clients.map((c) => [c.id, c.name]))
  return state.projects.map((p) => ({
    ...p,
    clientName: clientName[p.clientId] ?? 'Unassigned',
    ...projectTotals(state, p.id),
  }))
}

/* ------------------------------------------------------- the company side --

   What the business costs to run. None of this touches a project figure: the
   rows live in their own table and no project selector ever reads them.        */

/** Heads that belong to the company side, or the project side. */
export function headsOfKind(state, kind) {
  return state.categories.filter((c) => (c.kind || 'project') === kind)
}

/**
 * Company costs for a period, split the two ways an owner asks about them:
 * by what it was spent on, and by which office spent it.
 */
export function companyTotals(state, range) {
  const rows = withinPeriod(state.companyExpenses ?? [], range)
  const total = sum(rows)

  const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))
  const officeName = Object.fromEntries((state.offices ?? []).map((o) => [o.id, o.name]))

  const group = (keyOf, nameOf) => {
    const buckets = new Map()
    for (const row of rows) {
      const key = keyOf(row)
      if (!buckets.has(key)) buckets.set(key, { id: key, name: nameOf(key), amount: 0, count: 0 })
      const bucket = buckets.get(key)
      bucket.amount += Number(row.amount) || 0
      bucket.count += 1
    }
    return [...buckets.values()]
      .map((b) => ({ ...b, share: total > 0 ? b.amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }

  return {
    rows,
    total,
    count: rows.length,
    byHead: group(
      (r) => r.categoryId || '',
      (id) => catName[id] ?? 'Unfiled',
    ),
    // An empty office is not missing data — it is a cost that belongs to the
    // firm rather than to either office, like an ad campaign.
    byOffice: group(
      (r) => r.officeId || '',
      (id) => officeName[id] ?? 'Company-wide',
    ),
  }
}

/**
 * What moved through the firm's hands in a period, and what it left behind.
 *
 * This is the number the two dashboards feed. It is deliberately a MOVEMENT,
 * never called profit: a month where a client pays an advance looks enormous
 * and the month the work is done looks terrible, yet nothing about the business
 * changed. Accumulated, the swings cancel and it lands exactly on money in
 * hand — which is the figure that means something on its own.
 */
export function moneyMovement(state, range) {
  const clientMoney = sum(withinPeriod(state.receipts, range))
  const projectSpend = sum(withinPeriod(state.expenses, range))
  const companySpend = sum(withinPeriod(state.companyExpenses ?? [], range))

  return {
    clientMoney,
    projectSpend,
    companySpend,
    spend: projectSpend + companySpend,
    net: clientMoney - projectSpend - companySpend,
  }
}

/**
 * The last twelve months of movement, for the trend on the company dashboard.
 * Months with nothing in them are still returned, so the shape of a quiet month
 * is visible rather than collapsed out of the chart.
 */
export function monthlyCompanyFlow(state, months = 12, today = new Date()) {
  const out = []

  for (let back = months - 1; back >= 0; back -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1)
    const range = {
      from: isoDate(d),
      to: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    }
    const flow = moneyMovement(state, range)
    out.push({
      month: range.from.slice(0, 7),
      label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      // Named so the row drops straight into FlowChart, which plots money in
      // against money out. Here "out" is everything: jobs and the office both.
      incoming: flow.clientMoney,
      expenditure: flow.spend,
      ...flow,
    })
  }

  return out
}
