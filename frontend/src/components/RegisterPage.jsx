import { useState } from 'react'
import LivenessChallenge from './LivenessChallenge.jsx'
import { createLivenessSession, enrollLive } from '../api/faceApi.js'

function getOrgTenantId() {
  if (import.meta.env.VITE_TENANT_ID) return import.meta.env.VITE_TENANT_ID
  const stored = localStorage.getItem('lbfr_tenant_id')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('lbfr_tenant_id', id)
  return id
}

const S = {
  page: {
    minHeight: '100dvh',
    background: '#020917',
    backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(6,182,212,0.06) 0%, transparent 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px 20px 48px',
    fontFamily: "'Manrope', -apple-system, sans-serif",
    color: '#e2e8f0',
    WebkitFontSmoothing: 'antialiased',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginBottom: 40,
  },
  logoIcon: {
    width: 36, height: 36,
    background: 'rgba(6,182,212,0.10)',
    border: '1px solid rgba(6,182,212,0.28)',
    borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#06b6d4',
    flexShrink: 0,
    position: 'relative', overflow: 'hidden',
  },
  logoText: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 15, fontWeight: 700, color: '#e2e8f0',
    letterSpacing: '-0.2px',
  },
  card: {
    width: '100%', maxWidth: 440,
    background: '#080f1f',
    border: '1px solid rgba(6,182,212,0.12)',
    borderRadius: 20,
    padding: '32px 28px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 80px rgba(6,182,212,0.025)',
    animation: 'cardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '7px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontSize: 14, gap: 12,
  },
  rowLabel: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 10.5, fontWeight: 700,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase', letterSpacing: '0.8px',
  },
  rowValue: {
    fontFamily: "'Manrope', sans-serif",
    fontSize: 14, fontWeight: 600, color: '#e2e8f0',
    textAlign: 'right',
  },
  infoBox: {
    background: 'rgba(6,182,212,0.05)',
    border: '1px solid rgba(6,182,212,0.12)',
    borderRadius: 10, padding: '10px 14px',
    fontSize: 12.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7,
    marginBottom: 22,
  },
  errorBox: {
    background: 'rgba(244,63,94,0.07)',
    border: '1px solid rgba(244,63,94,0.22)',
    borderRadius: 10, padding: '10px 14px',
    fontSize: 13, color: '#fb7185', lineHeight: 1.5,
    marginBottom: 18,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  btn: {
    width: '100%', padding: '13px 22px', borderRadius: 11,
    border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 700, fontFamily: "'Manrope', sans-serif",
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, letterSpacing: 0.1,
    transition: 'transform 0.18s, box-shadow 0.18s',
    position: 'relative', overflow: 'hidden',
  },
}

export default function RegisterPage() {
  const params = new URLSearchParams(window.location.search)
  const visitorName = params.get('name') || ''
  const email  = params.get('email')  || ''
  const mobile = params.get('mobile') || ''

  const [step, setStep]                     = useState('capture')
  const [loading, setLoading]               = useState(false)
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [showLiveness, setShowLiveness]     = useState(false)
  const [error, setError]                   = useState(null)

  async function handleTakePhoto() {
    if (!visitorName) return
    setLoading(true)
    setError(null)
    try {
      const res = await createLivenessSession('ADMIN')
      setLivenessSessionId(res.data.sessionId)
      setShowLiveness(true)
    } catch {
      setError('Failed to start — please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLivenessComplete() {
    setShowLiveness(false)
    setLoading(true)
    const tenantId = getOrgTenantId()
    try {
      const data = await enrollLive({ tenantId, sessionId: livenessSessionId, visitorName, email, mobile })
      if (data.success !== false) {
        setStep('complete')
      } else {
        setError(data.message || 'Registration failed. Please try again.')
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
      setLivenessSessionId(null)
    }
  }

  function handleLivenessError() {
    setShowLiveness(false)
    setLivenessSessionId(null)
    setError('Photo capture failed — please try again.')
  }

  // Liveness screen — full screen
  if (showLiveness && livenessSessionId) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#020917',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Manrope', sans-serif",
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(6,182,212,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(8,15,31,0.8)',
          backdropFilter: 'blur(16px)',
        }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
              Take Your Photo
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              Look directly at the camera
            </div>
          </div>
          <button
            onClick={handleLivenessError}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.45)',
              borderRadius: 8, padding: '7px 16px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Manrope', sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LivenessChallenge
            sessionId={livenessSessionId}
            region={import.meta.env.VITE_AWS_REGION || 'ap-south-1'}
            onComplete={handleLivenessComplete}
            onError={handleLivenessError}
          />
        </div>
      </div>
    )
  }

  // Success screen
  if (step === 'complete') {
    return (
      <div style={S.page}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Syne:wght@400;700;800&display=swap');
          @keyframes cardIn { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
          @keyframes pulse-ring { 0% { transform:scale(1); opacity:0.65; } 100% { transform:scale(1.6); opacity:0; } }
          @keyframes glow-pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
          @keyframes draw-check { from { stroke-dashoffset:32; } to { stroke-dashoffset:0; } }
        `}</style>

        <div style={S.logo}>
          <div style={S.logoIcon}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M2 7V4a1 1 0 0 1 1-1h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M13 3h3a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M18 13v3a1 1 0 0 1-1 1h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M7 17H4a1 1 0 0 1-1-1v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </div>
          <span style={S.logoText}>LogBook<span style={{ color: '#06b6d4' }}>360</span></span>
        </div>

        <div style={{ ...S.card, textAlign: 'center' }}>
          {/* Success icon with rings */}
          <div style={{ position: 'relative', display: 'inline-flex', marginBottom: 28 }}>
            <div style={{
              position: 'absolute', inset: -20, borderRadius: '50%',
              border: '1px solid rgba(16,185,129,0.2)',
              animation: 'pulse-ring 2.5s ease-out infinite',
            }} />
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(16,185,129,0.09)',
              border: '2px solid rgba(16,185,129,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(16,185,129,0.15)',
            }}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                <path d="M6 15l7 7 11-13" stroke="#34d399" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="32"
                  style={{ animation: 'draw-check 0.5s ease-out 0.2s both' }}
                />
              </svg>
            </div>
          </div>

          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: '#34d399', marginBottom: 8, letterSpacing: -0.5 }}>
            You're registered!
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
            {visitorName}
          </div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.3)', lineHeight: 1.7, maxWidth: 300, margin: '0 auto' }}>
            Your face has been registered successfully.<br/>
            You may now use the kiosk to gain access.
          </div>
        </div>
      </div>
    )
  }

  // Registration form
  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Syne:wght@400;700;800&display=swap');
        @keyframes cardIn { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes icon-scan { 0% { transform:translateY(0); opacity:0; } 8% { opacity:0.9; } 92% { opacity:0.9; } 100% { transform:translateY(38px); opacity:0; } }
        * { box-sizing: border-box; }
      `}</style>

      {/* Logo */}
      <div style={S.logo}>
        <div style={S.logoIcon}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M2 7V4a1 1 0 0 1 1-1h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M13 3h3a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M18 13v3a1 1 0 0 1-1 1h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M7 17H4a1 1 0 0 1-1-1v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 2, top: 0,
            background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)',
            animation: 'icon-scan 2.8s ease-in-out infinite',
          }} />
        </div>
        <span style={S.logoText}>LogBook<span style={{ color: '#06b6d4' }}>360</span></span>
      </div>

      <div style={S.card}>
        {/* Welcome header */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            textTransform: 'uppercase', color: '#06b6d4',
            marginBottom: 8,
          }}>
            Visitor Registration
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 24, fontWeight: 800, color: '#e2e8f0',
            letterSpacing: -0.5, lineHeight: 1.2, marginBottom: 4,
          }}>
            Welcome,<br />{visitorName || 'Visitor'}
          </div>
        </div>

        {/* Details */}
        <div style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '4px 16px', marginBottom: 20,
        }}>
          {[
            { label: 'Name',   value: visitorName  || '—' },
            { label: 'Email',  value: email         || '—' },
            { label: 'Mobile', value: mobile        || '—' },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ ...S.row, borderBottom: i < arr.length - 1 ? S.row.borderBottom : 'none' }}>
              <span style={S.rowLabel}>{row.label}</span>
              <span style={S.rowValue}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Info */}
        <div style={S.infoBox}>
          You'll be asked to look at the camera for a few seconds. Make sure you're in a well-lit area.
        </div>

        {/* Error */}
        {error && (
          <div style={S.errorBox}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M7 4.5v3M7 9.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleTakePhoto}
          disabled={loading || !visitorName}
          style={{
            ...S.btn,
            background: loading || !visitorName
              ? 'rgba(6,182,212,0.25)'
              : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
            color: '#020917',
            boxShadow: (!loading && visitorName)
              ? '0 0 24px rgba(6,182,212,0.32), 0 1px 4px rgba(0,0,0,0.5)'
              : 'none',
            opacity: (!loading && visitorName) ? 1 : 0.45,
            cursor: (!loading && visitorName) ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={e => { if (!loading && visitorName) e.currentTarget.style.boxShadow = '0 0 36px rgba(6,182,212,0.52), 0 4px 12px rgba(0,0,0,0.4)' }}
          onMouseLeave={e => { if (!loading && visitorName) e.currentTarget.style.boxShadow = '0 0 24px rgba(6,182,212,0.32), 0 1px 4px rgba(0,0,0,0.5)' }}
        >
          {loading ? (
            <>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid rgba(2,9,23,0.2)', borderTopColor: '#020917',
                animation: 'spin 0.65s linear infinite', flexShrink: 0,
              }} />
              Starting…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 6V3a1 1 0 0 1 1-1h2M10 2h2a1 1 0 0 1 1 1v3M13 10v2a1 1 0 0 1-1 1h-2M6 13H4a1 1 0 0 1-1-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
              Take Your Photo
            </>
          )}
        </button>
      </div>
    </div>
  )
}
