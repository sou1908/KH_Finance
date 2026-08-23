// Attachments.
//
// In cloud mode the server is the real home for a bill photo and IndexedDB is
// just a local cache, so a file already viewed does not download twice.
// In local-only mode IndexedDB is the only copy.
//
// Either way the ledger row carries only lightweight metadata
// ({id, name, type, size}); the bytes are keyed by that id.

import { downloadFile, isCloud, removeFile, uploadFile } from './api'

const DB_NAME = 'kalope.files'
const STORE = 'blobs'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  return dbPromise
}

function tx(mode, run) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const req = run(transaction.objectStore(STORE))
        transaction.oncomplete = () => resolve(req?.result)
        transaction.onerror = () => reject(transaction.error)
      }),
  )
}

export const putFile = (id, blob) => tx('readwrite', (store) => store.put(blob, id))
const readCache = (id) => tx('readonly', (store) => store.get(id))
const dropCache = (id) => tx('readwrite', (store) => store.delete(id))

/**
 * Stores a file and returns its metadata.
 * In cloud mode it goes to the server first — if that fails the caller is told,
 * rather than the file quietly living on one laptop forever.
 */
export async function saveFile(id, blob, name, ownerType, ownerId) {
  await putFile(id, blob)

  if (!isCloud()) {
    return { id, name, type: blob.type, size: blob.size }
  }

  const file = blob instanceof File ? blob : new File([blob], name, { type: blob.type })
  const meta = await uploadFile(id, file, ownerType, ownerId)
  return { id: meta.id, name: meta.name ?? name, type: meta.type ?? blob.type, size: meta.size ?? blob.size }
}

/** Cache first, then the server; anything fetched is cached for next time. */
export async function getFile(id) {
  const cached = await readCache(id).catch(() => null)
  if (cached) return cached

  if (!isCloud()) return null

  try {
    const blob = await downloadFile(id)
    if (blob) putFile(id, blob).catch(() => {})
    return blob
  } catch {
    return null
  }
}

export async function deleteFile(id) {
  await dropCache(id).catch(() => {})
  if (isCloud()) await removeFile(id).catch(() => {})
}

export function deleteFiles(metas = []) {
  return Promise.all(metas.map((m) => deleteFile(m.id).catch(() => {})))
}

const MAX_EDGE = 1800
const JPEG_QUALITY = 0.82

/**
 * Phone cameras produce 4–8 MB files. A bill only needs to be readable, so
 * images are resized to fit within MAX_EDGE and re-encoded as JPEG — typically
 * a 10× reduction with no loss of legibility. PDFs pass through untouched.
 */
export async function prepareFile(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

    if (scale === 1 && file.size < 600_000) {
      bitmap.close()
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    return blob && blob.size < file.size ? blob : file
  } catch {
    // Anything unusual (HEIC the browser can't decode, a corrupt file) is
    // stored as-is rather than dropped.
    return file
  }
}

export function humanSize(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

/** Rough IndexedDB usage, for the Settings page. */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null
  const { usage, quota } = await navigator.storage.estimate()
  return { usage, quota }
}
