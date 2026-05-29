import { useState } from 'react'
import ResultBox from './ResultBox.jsx'
import { deleteFace } from '../api/faceApi.js'

export default function DeletePage() {
  const [tenantId, setTenantId] = useState('')
  const [visitorId, setVisitorId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmed, setConfirmed] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tenantId || !visitorId) return
    if (!confirmed) { setConfirmed(true); return }
    setLoading(true)
    setResult(null)
    setConfirmed(false)
    try {
      const data = await deleteFace({ tenantId, visitorId })
      setResult(data)
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-title">Delete Face</div>
      <div className="page-sub">Remove enrolled face from Rekognition, S3, and database. This action is irreversible.</div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Tenant ID</label>
            <input
              value={tenantId}
              onChange={e => { setTenantId(e.target.value); setConfirmed(false) }}
              placeholder="550e8400-e29b-41d4-a716-446655440000"
              required
            />
          </div>
          <div className="field">
            <label>Visitor ID</label>
            <input
              value={visitorId}
              onChange={e => { setVisitorId(e.target.value); setConfirmed(false) }}
              placeholder="660e8400-e29b-41d4-a716-446655440001"
              required
            />
          </div>

          {confirmed && (
            <div style={{
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.25)',
              borderRadius: 8, padding: '10px 14px',
              marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M7 1L13 12H1L7 1Z" stroke="#f87171" strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M7 5.5v3M7 10h.01" stroke="#f87171" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#f87171' }}>
                This will permanently delete the enrolled face. Click again to confirm.
              </span>
            </div>
          )}

          <button
            type="submit"
            className="btn-danger"
            disabled={loading || !tenantId || !visitorId}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading
              ? <><div className="spinner" /><span>Deleting…</span></>
              : confirmed
                ? <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Confirm Delete
                  </>
                : <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 4h10M5 4V2.5A.5.5 0 0 1 5.5 2h3a.5.5 0 0 1 .5.5V4M11 4l-.7 7.5A.5.5 0 0 1 9.8 12H4.2a.5.5 0 0 1-.5-.5L3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Delete Enrolled Face
                  </>
            }
          </button>
          {confirmed && (
            <button
              type="button"
              onClick={() => setConfirmed(false)}
              style={{
                width: '100%', marginTop: 8,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.4)', borderRadius: 8,
                padding: '10px', fontSize: 13, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </form>
        <ResultBox result={result} />
      </div>
    </div>
  )
}
