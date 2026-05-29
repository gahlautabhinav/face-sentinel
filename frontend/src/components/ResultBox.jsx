export default function ResultBox({ result }) {
  if (!result) return null

  const ok = result.success === true
  const cls = ok ? 'success' : 'error'
  const icon = ok
    ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#4ade80" strokeWidth="1.5"/><path d="M5 8l2 2 4-4" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#f87171" strokeWidth="1.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round"/></svg>

  const data = result.data
  const rows = data ? Object.entries(data).filter(([,v]) => v != null) : []

  return (
    <div className={`result-card ${cls}`}>
      <div className="result-card-header">
        {icon}
        {result.message || (ok ? 'Success' : 'Error')}
      </div>
      {rows.map(([k, v]) => (
        <div className="result-row" key={k}>
          <span className="result-row-label">{k}</span>
          <span className="result-row-value">{String(v)}</span>
        </div>
      ))}
    </div>
  )
}
