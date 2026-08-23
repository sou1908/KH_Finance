// HTTP client for the PHP API. The browser never sees the database — it talks
// to this, and only this.

/**
 * Where the API lives.
 *
 * In a production build the server that serves this page also answers /api, so
 * the default is same-origin and no environment variable is needed. In dev the
 * default is local-only, so `npm run dev` on its own still works without a
 * database — point VITE_API_URL at a running server to talk to one.
 */
const BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '/api')).replace(/\/$/, '')

const TOKEN_KEY = 'kalope.token'
const USER_KEY = 'kalope.user'

/** False means everything stays in this browser and there is no sign-in. */
export const isCloud = () => BASE !== ''

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

function setSession(token, user) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user ?? null))
  } else {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
    // 401 means the session died; anything else may succeed on a retry.
    this.isAuth = status === 401
  }
}

async function request(path, { method = 'GET', body, formData, raw = false } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch (err) {
    // No response at all: offline, DNS failure, or the server is down.
    throw new ApiError('Could not reach the server.', 0)
  }

  if (res.status === 401) {
    setSession(null)
    throw new ApiError('Your session has expired. Sign in again.', 401)
  }

  if (raw) {
    if (!res.ok) throw new ApiError(`Request failed (${res.status}).`, res.status)
    return res.blob()
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    throw new ApiError(`The server returned something unreadable (${res.status}).`, res.status)
  }

  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status}).`, res.status)
  return data
}

export async function login(email, password) {
  const data = await request('/auth/login', { method: 'POST', body: { email, password } })
  setSession(data.token, data.user)
  return data.user
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' })
  } catch {
    // Signing out locally matters more than telling the server about it.
  }
  setSession(null)
}

export const health = () => request('/health')
export const fetchState = () => request('/state')
export const pushOps = (ops) => request('/sync', { method: 'POST', body: { ops } })

export function uploadFile(id, file, ownerType, ownerId) {
  const form = new FormData()
  form.append('file', file, file.name ?? `${id}.jpg`)
  form.append('id', id)
  form.append('ownerType', ownerType ?? '')
  form.append('ownerId', ownerId ?? '')
  return request('/files', { method: 'POST', formData: form })
}

export const downloadFile = (id) => request(`/files/${id}`, { raw: true })
export const removeFile = (id) => request(`/files/${id}`, { method: 'DELETE' })
