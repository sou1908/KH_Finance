import { ATTACHABLE, ENTITIES, normalise, rowToJson, tableOf } from './entities.js'

/**
 * Applying the browser's queued operations.
 *
 * Every write is an upsert keyed by an id the browser generated, so replaying a
 * batch is harmless — that is what makes the outbox safe to retry.
 */

export async function loadState(conn) {
  const state = {}

  for (const [entity, fields] of Object.entries(ENTITIES)) {
    // Dated rows sort by date; masters sort by name. Getting this wrong is not
    // a cosmetic problem — ordering by a column the table does not have throws.
    const dated = ['receipts', 'expenses', 'transfers', 'movements', 'companyExpenses'].includes(entity)
    const order = dated ? '`date` DESC, id DESC' : 'name ASC'
    const [rows] = await conn.query(
      `SELECT * FROM \`${tableOf(entity)}\` WHERE deleted_at IS NULL ORDER BY ${order}`,
    )
    state[entity] = rows.map((row) => rowToJson(row, fields))
  }

  await attachFiles(conn, state)
  return state
}

/** Hangs each row's attachment list off it, in one query for all of them. */
async function attachFiles(conn, state) {
  const [rows] = await conn.query(
    `SELECT id, owner_type, owner_id, name, mime, size
       FROM attachments
      WHERE deleted_at IS NULL AND owner_id <> ''
      ORDER BY uploaded_at ASC`,
  )

  const byOwner = new Map()
  for (const r of rows) {
    const key = `${r.owner_type}:${r.owner_id}`
    if (!byOwner.has(key)) byOwner.set(key, [])
    byOwner.get(key).push({ id: r.id, name: r.name, type: r.mime, size: Number(r.size) })
  }

  for (const entity of ATTACHABLE) {
    for (const row of state[entity]) {
      row.attachments = byOwner.get(`${entity}:${row.id}`) ?? []
    }
  }
}

export async function applyOp(conn, op, userId) {
  const { type, entity, payload } = op ?? {}

  switch (type) {
    case 'add':
    case 'update':
      return upsert(conn, entity, payload ?? {}, userId)

    case 'remove':
      return softDelete(conn, entity, String(payload?.id ?? ''), userId)

    case 'removeProject':
      return removeProject(conn, String(payload?.id ?? ''), userId)

    case 'replaceAll':
      return replaceAll(conn, payload ?? {}, userId)

    default:
      throw new Error(`Unknown operation type: ${type}`)
  }
}

async function upsert(conn, entity, row, userId) {
  const fields = ENTITIES[entity]
  if (!fields) throw new Error(`Unknown entity: ${entity}`)

  const id = String(row.id ?? '')
  if (!id) throw new Error(`A ${entity} row arrived without an id`)

  // Who recorded a movement is stamped here from the session, and whatever the
  // browser sent for it is discarded. An audit trail the client can write is
  // not an audit trail: it would record whoever the sender claimed to be.
  const source = entity === 'movements' ? { ...row, userId: userId ?? null } : row

  const columns = []
  const values = []
  for (const [jsKey, column] of Object.entries(fields)) {
    if (!Object.hasOwn(source, jsKey)) continue
    columns.push(column)
    values.push(normalise(jsKey, source[jsKey]))
  }

  const placeholders = columns.map(() => '?').join(', ')
  const updates = columns.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ')
  const columnList = columns.map((c) => `\`${c}\``).join(', ')

  // deleted_at is cleared because saving a row means it exists again.
  await conn.execute(
    `INSERT INTO \`${tableOf(entity)}\` (${columnList}) VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${updates}, deleted_at = NULL`,
    values,
  )

  if (Object.hasOwn(row, 'attachments') && ATTACHABLE.includes(entity)) {
    await syncAttachments(conn, entity, id, Array.isArray(row.attachments) ? row.attachments : [])
  }

  await audit(conn, userId, "upsert", entity, id, source)
}

/** Points the listed files at this row and retires any it no longer claims. */
async function syncAttachments(conn, entity, rowId, list) {
  const keep = []

  for (const meta of list) {
    const attId = String(meta?.id ?? '').replace(/[^A-Za-z0-9_]/g, '')
    if (!attId) continue
    keep.push(attId)
    await conn.execute(
      'UPDATE attachments SET owner_type = ?, owner_id = ?, deleted_at = NULL WHERE id = ?',
      [entity, rowId, attId],
    )
  }

  if (!keep.length) {
    await conn.execute(
      'UPDATE attachments SET deleted_at = NOW() WHERE owner_type = ? AND owner_id = ? AND deleted_at IS NULL',
      [entity, rowId],
    )
    return
  }

  const placeholders = keep.map(() => '?').join(', ')
  await conn.execute(
    `UPDATE attachments SET deleted_at = NOW()
      WHERE owner_type = ? AND owner_id = ? AND deleted_at IS NULL AND id NOT IN (${placeholders})`,
    [entity, rowId, ...keep],
  )
}

async function softDelete(conn, entity, id, userId) {
  if (!ENTITIES[entity] || !id) throw new Error(`Cannot delete from ${entity}`)
  // Nothing is ever really deleted; a mis-click stays recoverable.
  await conn.execute(`UPDATE \`${tableOf(entity)}\` SET deleted_at = NOW() WHERE id = ?`, [id])
  await audit(conn, userId, 'remove', entity, id, null)
}

async function removeProject(conn, id, userId) {
  if (!id) throw new Error('Cannot delete a project without an id')

  for (const [table, column] of [
    ['projects', 'id'],
    ['receipts', 'project_id'],
    ['expenses', 'project_id'],
  ]) {
    await conn.execute(`UPDATE \`${table}\` SET deleted_at = NOW() WHERE \`${column}\` = ?`, [id])
  }

  // Transfers survive. The money really did move between accounts, so deleting
  // the record would leave every balance wrong; only the earmark is cleared.
  await conn.execute("UPDATE transfers SET project_id = NULL WHERE project_id = ?", [id])

  await audit(conn, userId, 'removeProject', 'projects', id, null)
}

/** Backs "erase everything" and restoring a backup. Replaces the whole ledger. */
async function replaceAll(conn, state, userId) {
  for (const entity of Object.keys(ENTITIES)) {
    await conn.query(`UPDATE \`${tableOf(entity)}\` SET deleted_at = NOW() WHERE deleted_at IS NULL`)
  }
  for (const entity of Object.keys(ENTITIES)) {
    for (const row of state[entity] ?? []) {
      if (row && typeof row === 'object') await upsert(conn, entity, row, userId)
    }
  }
  await audit(conn, userId, 'replaceAll', 'all', null, {
    counts: Object.fromEntries(Object.keys(ENTITIES).map((e) => [e, (state[e] ?? []).length])),
  })
}

/** The tape. If a number is ever disputed, this is what settles it. */
async function audit(conn, userId, op, entity, rowId, payload) {
  try {
    await conn.execute('INSERT INTO audit_log (user_id, op, entity, row_id, payload) VALUES (?, ?, ?, ?, ?)', [
      userId ?? null,
      op,
      entity,
      rowId ?? null,
      payload === null || payload === undefined ? null : JSON.stringify(payload),
    ])
  } catch (err) {
    // The audit trail must never block a real write.
    console.error('[kalope] audit failed:', err.message)
  }
}
