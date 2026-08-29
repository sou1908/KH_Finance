/**
 * Which reminders have already been shown, and when.
 *
 * Kept in this browser rather than in the ledger, deliberately. Dismissing a
 * popup is not a fact about the business — it is one person on one device
 * saying "yes, I have seen it". Writing it to the ledger would sync a dismissal
 * to every other device and to a backup, and a restored backup would then hide
 * a bill that still has not been paid.
 *
 * A dismissal lasts for the day, never longer. An unpaid bill comes back
 * tomorrow, because that is the whole point of it.
 */

const KEY = 'kalope.notices.seen'

const read = () => {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** `{ [noticeKey]: 'YYYY-MM-DD' }` — the day it was last dismissed. */
export function seenMap() {
  return read()
}

export function markSeen(keys, today) {
  const map = read()
  for (const key of [].concat(keys)) map[key] = today

  // Yesterday's dismissals can never match today's date, so they are dead
  // weight. Dropped on write to stop the entry growing for the life of the
  // browser profile.
  const live = Object.fromEntries(Object.entries(map).filter(([, day]) => day === today))

  try {
    localStorage.setItem(KEY, JSON.stringify(live))
  } catch {
    // A browser refusing storage means the reminder shows again. That is the
    // safe direction to fail in.
  }
  return live
}
