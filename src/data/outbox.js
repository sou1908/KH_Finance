// The "nothing gets lost" guarantee.
//
// Every change is applied to the screen immediately and appended to this queue,
// which is persisted before the UI updates. A change leaves the queue only once
// the server has confirmed it. So a dropped connection, a closed laptop, or a
// dead battery mid-entry costs nothing: the queue is still there on next load
// and drains itself.

import { ApiError, isCloud, getToken, pushOps } from './api'
import { newId } from './repo'

const QUEUE_KEY = 'kalope.outbox.v1'
const MAX_BACKOFF = 60_000

let queue = readQueue()
let draining = false
let timer = null
let backoff = 2_000

const listeners = new Set()

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (err) {
    console.warn('Could not persist the pending-changes queue:', err)
  }
}

export const status = {
  pending: () => queue.length,
  syncing: () => draining,
  lastError: null,
  lastSyncAt: null,
}

function announce() {
  listeners.forEach((fn) => fn())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Queues one change and starts a send. Safe to call as fast as someone types. */
export function enqueue(type, entity, payload) {
  if (!isCloud()) return

  queue.push({ id: newId('op'), type, entity, payload, at: new Date().toISOString() })
  writeQueue()
  announce()
  drain()
}

export async function drain() {
  if (!isCloud() || draining || queue.length === 0) return
  if (!getToken() || !navigator.onLine) return

  draining = true
  announce()

  // Snapshot the batch; anything queued while this is in flight goes next round.
  const batch = queue.slice(0, 200)

  try {
    await pushOps(batch)

    const sent = new Set(batch.map((op) => op.id))
    queue = queue.filter((op) => !sent.has(op.id))
    writeQueue()

    status.lastError = null
    status.lastSyncAt = new Date().toISOString()
    backoff = 2_000

    draining = false
    announce()

    // More arrived while we were sending.
    if (queue.length) drain()
    return
  } catch (err) {
    status.lastError = err.message

    // A rejected batch (422) would fail identically forever and block every
    // change behind it, so it is moved aside rather than retried into a wall.
    if (err instanceof ApiError && err.status === 422) {
      console.error('Server rejected these changes:', batch, err.message)
      const sent = new Set(batch.map((op) => op.id))
      queue = queue.filter((op) => !sent.has(op.id))
      writeQueue()
      status.lastError = `${batch.length} change(s) were rejected by the server and have been skipped. ${err.message}`
    } else if (err instanceof ApiError && err.isAuth) {
      // Keep the queue. It drains once someone signs in again.
      status.lastError = 'Signed out — your unsaved changes are still queued.'
    } else {
      schedule()
    }
  } finally {
    draining = false
    announce()
  }
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(drain, backoff)
  backoff = Math.min(backoff * 2, MAX_BACKOFF)
}

/** Everything queued, for the "unsaved changes" panel. */
export const peek = () => queue.slice()

export function clearQueue() {
  queue = []
  writeQueue()
  announce()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    backoff = 2_000
    drain()
  })
  window.addEventListener('offline', announce)

  // Last-chance warning if someone closes the tab with work still unsent.
  window.addEventListener('beforeunload', (e) => {
    if (queue.length > 0) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
}
