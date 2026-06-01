import { useState, useEffect, useCallback } from 'react'
import { listEnrollments, deleteFace } from '../api/faceApi.js'

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const AVATAR_COLORS = [
  ['#0891b2','#083344'], ['#7c3aed','#2e1065'], ['#db2777','#500724'],
  ['#059669','#064e3b'], ['#d97706','#451a03'], ['#dc2626','#450a0a'],
]
function avatarColor(name) {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function AdminPage() {
  const envTenant = import.meta.env.VITE_TENANT_ID || ''

  const [tenantId, setTenantId] = useState(envTenant)
  const [inputTenant, setInputTenant] = useState(envTenant)
  const [rows, setRows]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [confirmId, setConfirmId]   = useState(null)   // visitorId pending delete confirm
  const [deletingId, setDeletingId] = useState(null)   // visitorId being deleted

  const load = useCallback(async (tid) => {
    if (!tid) return
    setLoading(true)
    setError(null)
    try {
      const res = await listEnrollments({ tenantId: tid })
      setRows(res.data || [])
    } catch (e) {
      setError(e.message || 'Failed to load enrollments')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (envTenant) load(envTenant)
  }, [])

  function handleLoadTenant(e) {
    e.preventDefault()
    const t = inputTenant.trim()
    if (!t) return
    setTenantId(t)
    setRows([])
    load(t)
  }

  async function handleDelete(visitorId) {
    setDeletingId(visitorId)
    setConfirmId(null)
    try {
      await deleteFace({ tenantId, visitorId })
      setRows(r => r.filter(row => row.visitorId !== visitorId))
    } catch (e) {
      setError(e.message || 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const hasTenant = !!tenantId

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <div className="page-title">Enrollments</div>
          {hasTenant && !loading && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 4,
              background: 'var(--primary-dim)', border: '1px solid rgba(6,182,212,0.2)',
              borderRadius: 9999, padding: '3px 12px',
              fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 700,
              color: 'var(--primary)', letterSpacing: 0.8,
            }}>
              {rows.length} ENROLLED
            </div>
          )}
        </div>
        {hasTenant && (
          <button
            onClick={() => load(tenantId)}
            disabled={loading}
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text-2)', borderRadius: 8, padding: '8px 16px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 7, transition: 'all 0.15s', minHeight: 36,
              fontFamily: "'Manrope', sans-serif",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)' }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M11 6.5A4.5 4.5 0 0 1 2.5 9M2 6.5A4.5 4.5 0 0 1 10.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M10.5 1.5V4H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2.5 9v2.5H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Refresh
          </button>
        )}
      </div>

      <div className="page-sub">
        All enrolled visitors for this tenant. Delete removes the face from AWS Rekognition, S3, and the database.
      </div>

      {/* Tenant ID input — only when not set via env */}
      {!envTenant && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form onSubmit={handleLoadTenant} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Tenant ID</label>
              <input
                value={inputTenant}
                onChange={e => setInputTenant(e.target.value)}
                placeholder="550e8400-e29b-41d4-a716-446655440000"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={!inputTenant.trim()} style={{ flexShrink: 0 }}>
              Load
            </button>
          </form>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          background: 'var(--danger-dim)', border: '1px solid rgba(244,63,94,0.25)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          fontSize: 13, color: '#fb7185', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 4.5v3M7 9.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, opacity: 0.6 }}>✕</button>
        </div>
      )}

      {/* Table card */}
      {hasTenant && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <SkeletonRows />
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '32%' }} />
                  <col style={{ width: '26%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Visitor', 'Contact', 'Confidence', 'Enrolled', 'Action'].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'left',
                        fontFamily: "'Syne', sans-serif", fontSize: 10.5, fontWeight: 700,
                        color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <TableRow
                      key={row.visitorId}
                      row={row}
                      isLast={i === rows.length - 1}
                      isConfirm={confirmId === row.visitorId}
                      isDeleting={deletingId === row.visitorId}
                      onDeleteClick={() => setConfirmId(confirmId === row.visitorId ? null : row.visitorId)}
                      onConfirm={() => handleDelete(row.visitorId)}
                      onCancel={() => setConfirmId(null)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TableRow({ row, isLast, isConfirm, isDeleting, onDeleteClick, onConfirm, onCancel }) {
  const [fg, bg] = avatarColor(row.name)
  const tdStyle = {
    padding: '14px 16px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    verticalAlign: 'middle',
    background: isConfirm ? 'rgba(244,63,94,0.04)' : 'transparent',
    transition: 'background 0.15s',
  }

  return (
    <tr>
      {/* Visitor */}
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: bg, border: `1px solid ${fg}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: fg,
          }}>
            {initials(row.name)}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
              {row.name}
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: 'var(--text-3)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {row.visitorId}
            </div>
          </div>
        </div>
      </td>

      {/* Contact */}
      <td style={tdStyle}>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {row.email || <span style={{ color: 'var(--text-3)' }}>—</span>}
        </div>
        {row.phone && (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.phone}</div>
        )}
      </td>

      {/* Confidence */}
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 48, height: 4, borderRadius: 2,
            background: 'var(--surface-3)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${Math.min(row.confidence || 0, 100)}%`,
              background: row.confidence >= 95
                ? 'var(--success)' : row.confidence >= 85
                  ? 'var(--primary)' : 'var(--danger)',
            }} />
          </div>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap',
          }}>
            {row.confidence != null ? row.confidence.toFixed(1) + '%' : '—'}
          </span>
        </div>
      </td>

      {/* Enrolled date */}
      <td style={tdStyle}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
          {formatDate(row.enrolledAt)}
        </div>
      </td>

      {/* Action */}
      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
        {isDeleting ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 13 }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid rgba(244,63,94,0.25)', borderTopColor: 'var(--danger)',
              animation: 'spin 0.65s linear infinite',
            }} />
            Deleting…
          </div>
        ) : isConfirm ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onConfirm}
              style={{
                background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)',
                color: '#fb7185', borderRadius: 7, padding: '6px 14px',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Manrope', sans-serif",
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 2l7 7M9 2L2 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Confirm
            </button>
            <button
              onClick={onCancel}
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-3)', borderRadius: 7, padding: '6px 12px',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Manrope', sans-serif",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={onDeleteClick}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-3)', borderRadius: 7, padding: '6px 14px',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: "'Manrope', sans-serif",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(244,63,94,0.08)'
              e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)'
              e.currentTarget.style.color = '#fb7185'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-3)'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1.5 3h9M4 3V2a.5.5 0 0 1 .5-.5h3A.5.5 0 0 1 8 2v1M9.5 3l-.6 7a.5.5 0 0 1-.5.5H3.6a.5.5 0 0 1-.5-.5L2.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Delete
          </button>
        )}
      </td>
    </tr>
  )
}

function SkeletonRows() {
  return (
    <div style={{ padding: '8px 0' }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '16px 20px',
          borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-3)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: '30%', height: 12, background: 'var(--surface-3)', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ width: '50%', height: 10, background: 'var(--surface-2)', borderRadius: 4 }} />
          </div>
          <div style={{ width: 80, height: 10, background: 'var(--surface-3)', borderRadius: 4 }} />
          <div style={{ width: 100, height: 10, background: 'var(--surface-2)', borderRadius: 4 }} />
          <div style={{ width: 60, height: 28, background: 'var(--surface-3)', borderRadius: 7 }} />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      padding: '56px 20px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M17 20H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6l4 4v10a2 2 0 0 1-2 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M13 4v4h4M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-2)', marginBottom: 4 }}>
          No enrollments found
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          Enroll a visitor to see them here.
        </div>
      </div>
    </div>
  )
}
