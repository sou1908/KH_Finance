import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

/**
 * Bill photos and payment slips.
 *
 * The file's real content decides its type — never the browser-supplied one,
 * which is trivially forged. Sniffing magic bytes here avoids adding a
 * dependency for five formats.
 */

const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { mime: 'image/gif', ext: 'gif', test: (b) => b.subarray(0, 3).toString('latin1') === 'GIF' },
  {
    // HEIC from an iPhone: 'ftyp' at offset 4, brand starting 'hei' or 'mif'.
    mime: 'image/heic',
    ext: 'heic',
    test: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && /hei|mif/.test(b.subarray(8, 12).toString('latin1')),
  },
]

/** @returns {{mime: string, ext: string} | null} null when it is not an allowed type. */
export function sniffType(buffer) {
  if (!buffer || buffer.length < 12) return null
  return SIGNATURES.find((s) => s.test(buffer)) ?? null
}

let ready = false

export async function uploadDir() {
  if (!ready) {
    await fs.mkdir(config.uploadDir, { recursive: true })
    ready = true
  }
  return config.uploadDir
}

/**
 * Writes the bytes under a name we generate. The uploaded filename is never
 * used on disk, so a file called "../../server/index.js" cannot escape.
 */
export async function writeFile(id, ext, buffer) {
  const dir = await uploadDir()
  const filename = `${id}.${ext}`
  await fs.writeFile(path.join(dir, filename), buffer)
  return filename
}

export async function readFile(storedName) {
  const dir = await uploadDir()
  // basename strips any path component that somehow reached the database.
  return fs.readFile(path.join(dir, path.basename(storedName)))
}

export async function uploadDirStatus() {
  const insideAppFolder = isInsideApp(config.uploadDir)

  try {
    // Create it if it is not there yet, so health reports what will actually
    // happen at upload time rather than "missing" on a fresh install.
    const dir = await uploadDir()
    await fs.access(dir, constants.W_OK)
    return { exists: true, writable: true, insideAppFolder }
  } catch {
    return { exists: false, writable: false, insideAppFolder }
  }
}

function isInsideApp(dir) {
  const app = path.resolve(process.cwd())
  return path.resolve(dir).startsWith(app)
}
