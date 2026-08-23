import { useEffect, useRef, useState } from 'react'
import { deleteFile, getFile, humanSize, prepareFile, saveFile } from '../data/files'
import { newId } from '../data/repo'

const ACCEPT = 'image/*,application/pdf'

/**
 * Bill photos and payment slips. Files go to IndexedDB; `value` is the list of
 * lightweight metadata records that gets saved onto the ledger row.
 */
export default function Attachments({
  value = [],
  onChange,
  label = 'Bill photo or PDF',
  hint,
  ownerType,
  ownerId,
}) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const take = async (fileList) => {
    const files = [...fileList]
    if (!files.length) return

    setBusy(true)
    setError('')

    try {
      const added = []
      for (const file of files) {
        const blob = await prepareFile(file)
        const id = newId('att')
        added.push(await saveFile(id, blob, file.name, ownerType, ownerId))
      }
      onChange([...value, ...added])
    } catch (err) {
      setError(`Could not attach that file. ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const drop = (e) => {
    e.preventDefault()
    setDragging(false)
    take(e.dataTransfer.files)
  }

  const removeAt = async (meta) => {
    await deleteFile(meta.id).catch(() => {})
    onChange(value.filter((v) => v.id !== meta.id))
  }

  return (
    <div className="field">
      <label>{label}</label>

      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            take(e.target.files)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn tiny" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Attaching…' : 'Choose files'}
        </button>
        <span className="note">or drag them here — photos, screenshots, PDFs</span>
      </div>

      {error && <span className="hint neg">{error}</span>}
      {hint && !error && <span className="hint">{hint}</span>}

      {value.length > 0 && (
        <ul className="attach-list">
          {value.map((meta) => (
            <AttachmentRow key={meta.id} meta={meta} onRemove={() => removeAt(meta)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function AttachmentRow({ meta, onRemove }) {
  const url = useObjectURL(meta.id)
  const isImage = (meta.type || '').startsWith('image/')

  return (
    <li className="attach-row">
      <span className="attach-thumb">
        {isImage && url ? <img src={url} alt="" /> : <span className="attach-ext">PDF</span>}
      </span>

      <span className="attach-meta">
        <span className="attach-name">{meta.name}</span>
        <span className="sub-line num">{humanSize(meta.size)}</span>
      </span>

      {url && (
        <>
          <a className="btn ghost tiny" href={url} target="_blank" rel="noreferrer">
            View
          </a>
          <a className="btn ghost tiny" href={url} download={meta.name}>
            Save
          </a>
        </>
      )}
      <button type="button" className="btn ghost tiny danger" onClick={onRemove}>
        Remove
      </button>
    </li>
  )
}

/** Pulls the blob out of IndexedDB and hands back a URL, revoking it on unmount. */
export function useObjectURL(id) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let revoked = false
    let made = null

    getFile(id)
      .then((blob) => {
        if (!blob || revoked) return
        made = URL.createObjectURL(blob)
        setUrl(made)
      })
      .catch(() => {})

    return () => {
      revoked = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])

  return url
}

/** Every document filed against a project, shown as openable cards. */
export function AttachmentGallery({ items = [] }) {
  return (
    <div className="attach-grid">
      {items.map((item) => (
        <GalleryCard key={item.id} item={item} />
      ))}
    </div>
  )
}

function GalleryCard({ item }) {
  const url = useObjectURL(item.id)
  const isImage = (item.type || '').startsWith('image/')

  return (
    <a className="attach-card" href={url ?? '#'} target="_blank" rel="noreferrer">
      {isImage && url ? (
        <img src={url} alt={item.name} />
      ) : (
        <span className="attach-thumb" style={{ width: '100%', height: 110, border: 0, borderRadius: 0 }}>
          <span className="attach-ext">PDF</span>
        </span>
      )}
      <span className="cap">
        <strong style={{ display: 'block', fontWeight: 500 }}>{item.source}</strong>
        <span className="sub-line">{item.name}</span>
      </span>
    </a>
  )
}

/** The little paperclip count shown in ledger tables. */
export function AttachmentCount({ items = [] }) {
  if (!items.length) return null
  return (
    <span className="chip" title={items.map((i) => i.name).join(', ')}>
      📎 {items.length}
    </span>
  )
}
