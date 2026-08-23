export default function Panel({ title, action, children, flush }) {
  return (
    <section className="panel">
      {(title || action) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          <div className="spacer" />
          {action}
        </header>
      )}
      {flush ? children : <div className="panel-body">{children}</div>}
    </section>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
