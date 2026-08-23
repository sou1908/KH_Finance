import { useEffect } from 'react'

export default function Dialog({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="note">{subtitle}</div>}
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn ghost tiny" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}
