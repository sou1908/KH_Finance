/**
 * What each role may see and do.
 *
 * The whole point is that money never reaches a procurement browser. Hiding
 * figures in the interface would be a curtain, not a control — anyone can open
 * developer tools and call /api/state. So this is enforced on the way OUT of
 * the server: the fields below are the only ones that are ever sent, and any
 * write that is not on the allowed list is refused.
 *
 * Keeping it in one file means the answer to "can they see rates?" is read in
 * one place rather than inferred from a dozen route handlers.
 */

export const ROLES = {
  OWNER: 'owner',
  PROCUREMENT: 'procurement',
}

export const ROLE_LABELS = {
  [ROLES.OWNER]: 'Owner — sees and does everything',
  [ROLES.PROCUREMENT]: 'Procurement — quantities only, never money',
}

export const isOwner = (user) => (user?.role ?? ROLES.OWNER) === ROLES.OWNER

/**
 * Procurement's view of the ledger.
 *
 * Entities absent from this map are never sent at all — receipts, transfers and
 * accounts do not appear, so there is nothing to leak. For the entities that do
 * appear, only the listed fields survive.
 *
 * expenses keeps vendor (they collect from them) and quantity (their whole job)
 * and drops rate, amount and billNo. A purchase line without its price is still
 * everything procurement needs: what was bought, how much, and for which job.
 */
export const PROCUREMENT_FIELDS = {
  projects: ['id', 'name', 'site', 'status', 'startDate'],
  categories: ['id', 'name', 'unit', 'tracksInventory'],
  items: ['id', 'categoryId', 'name', 'unit'],
  vendors: ['id', 'name', 'phone'],
  expenses: ['id', 'projectId', 'date', 'categoryId', 'vendor', 'description', 'qty', 'unit', 'usedQty'],
  movements: ['id', 'expenseId', 'type', 'qty', 'fromProjectId', 'toProjectId', 'date', 'note', 'userId'],
}

/** Which entities a role may write, and which operations it may use. */
const WRITE_RULES = {
  [ROLES.OWNER]: null, // null means no restriction
  [ROLES.PROCUREMENT]: {
    entities: ['movements'],
    types: ['add', 'update', 'remove'],
  },
}

/**
 * Strips the state down to what this role is allowed to receive.
 * Returns the object unchanged for an owner.
 */
export function filterStateFor(user, state) {
  if (isOwner(user)) return state

  const allowed = PROCUREMENT_FIELDS
  const out = {}

  for (const [entity, fields] of Object.entries(allowed)) {
    out[entity] = (state[entity] ?? []).map((row) =>
      Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])),
    )
  }

  return out
}

/**
 * Whether this role may apply one queued operation.
 * @returns {string | null} the reason it is refused, or null if allowed.
 */
export function refuseWrite(user, op) {
  const rules = WRITE_RULES[user?.role ?? ROLES.OWNER]
  if (!rules) return null

  const { type, entity } = op ?? {}

  if (!rules.types.includes(type)) {
    return `Your account cannot perform "${type}".`
  }
  if (!rules.entities.includes(entity)) {
    return `Your account cannot change ${entity}.`
  }
  return null
}
