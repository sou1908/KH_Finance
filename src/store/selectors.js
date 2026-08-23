// Every rupee calculation in the app lives here. Components read, never compute.
// When the numbers are ever questioned, this is the only file to audit.

const sum = (rows, pick = (r) => r.amount) => rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0)

export function byProject(rows, projectId) {
  return projectId === 'all' || !projectId ? rows : rows.filter((r) => r.projectId === projectId)
}

/**
 * The core statement. `remaining` is what the sketch calls "how much is saved":
 * money received minus money spent. Negative means the project is running on
 * the firm's own money and needs a payment call.
 */
export function projectTotals(state, projectId) {
  const receipts = byProject(state.receipts, projectId)
  const expenses = byProject(state.expenses, projectId)

  const incoming = sum(receipts)
  const expenditure = sum(expenses)
  const remaining = incoming - expenditure

  const projects = projectId === 'all' ? state.projects : state.projects.filter((p) => p.id === projectId)
  const quoted = sum(projects, (p) => p.quotedAmount)

  return {
    incoming,
    expenditure,
    remaining,
    quoted,
    // How much of the quote is still uninvoiced/uncollected.
    pendingFromClient: Math.max(quoted - incoming, 0),
    // Share of received money already spent — drives the caliper scale.
    burnRatio: incoming > 0 ? expenditure / incoming : 0,
    // Share of the quote spent — the real margin warning.
    quoteRatio: quoted > 0 ? expenditure / quoted : 0,
    margin: quoted - expenditure,
    receiptCount: receipts.length,
    expenseCount: expenses.length,
  }
}

/** Expenditure split by head, biggest first, with percentage of total spend. */
export function categoryBreakdown(state, projectId) {
  const expenses = byProject(state.expenses, projectId)
  const total = sum(expenses)

  return state.categories
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
 * Per-account movement. This is what reconciles the sketch's three inflow
 * channels against real spending — cash in hand, each partner's personal
 * account, and the company account are all tracked separately.
 */
export function accountLedger(state, projectId) {
  const receipts = byProject(state.receipts, projectId)
  const expenses = byProject(state.expenses, projectId)

  return state.accounts.map((acc) => {
    const inRows = receipts.filter((r) => r.accountId === acc.id)
    const outRows = expenses.filter((e) => e.accountId === acc.id)
    const inflow = sum(inRows)
    const outflow = sum(outRows)
    const opening = projectId === 'all' ? Number(acc.openingBalance) || 0 : 0

    return {
      ...acc,
      inflow,
      outflow,
      balance: opening + inflow - outflow,
      opening,
      movements: inRows.length + outRows.length,
    }
  })
}

/**
 * Inventory Left = what was bought minus what was consumed, for the heads
 * flagged `tracksInventory`. Value is carried at the purchase rate, so it can
 * be moved to another project instead of written off.
 */
export function inventoryLeft(state, projectId) {
  const tracked = new Set(state.categories.filter((c) => c.tracksInventory).map((c) => c.id))
  const catName = Object.fromEntries(state.categories.map((c) => [c.id, c.name]))

  const lines = byProject(state.expenses, projectId)
    .filter((e) => tracked.has(e.categoryId))
    .map((e) => {
      const qty = Number(e.qty) || 0
      const used = Math.min(Number(e.usedQty) || 0, qty)
      const left = qty - used
      const rate = Number(e.rate) || 0
      return {
        id: e.id,
        projectId: e.projectId,
        date: e.date,
        category: catName[e.categoryId] ?? '—',
        description: e.description || e.vendor,
        vendor: e.vendor,
        unit: e.unit,
        qty,
        used,
        left,
        rate,
        value: left * rate,
        consumedPct: qty > 0 ? used / qty : 0,
      }
    })
    .sort((a, b) => b.value - a.value)

  return { lines, totalValue: sum(lines, (l) => l.value) }
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
