// The ONLY module that knows where data physically lives.
// v1 = localStorage. v2 = swap the two functions below for fetch() calls to an
// API or Supabase; nothing else in the app changes.

const KEY = 'kalope.finance.v1'

// The app shipped one build under the wrong name. Anything saved then is still
// real data, so read it once and let the next save() move it across.
const LEGACY_KEYS = ['calipy.finance.v1']

export function load() {
  try {
    for (const key of [KEY, ...LEGACY_KEYS]) {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw)
    }
    return null
  } catch {
    return null
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key))
  } catch (err) {
    console.warn('Could not save to this browser:', err)
  }
}

export function clear() {
  ;[KEY, ...LEGACY_KEYS].forEach((key) => localStorage.removeItem(key))
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
