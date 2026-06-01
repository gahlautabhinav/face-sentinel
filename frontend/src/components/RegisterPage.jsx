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

export default function RegisterPage() {
  const params = new URLSearchParams(window.location.search)
  const visitorName = params.get('name') || ''
  const email = params.get('email') || ''
  const mobile = params.get('mobile') || ''

  const [step, setStep] = useState('capture')
  const [loading, setLoading] = useState(false)
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [showLiveness, setShowLiveness] = useState(false)
  const [error, setError] = useState(null)

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
      const data = await enrollLive({
        tenantId,
        sessionId: livenessSessionId,
        visitorName,
        email,
        mobile,
      })
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

  if (showLiveness && livenessSessionId) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#080e1a', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8edf5' }}>Take Your Photo</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              Please look at the camera
            </div>
          </div>
          <button
            onClick={handleLivenessError}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '7px 16px',
              fontSize: 13, cursor: 'pointer',
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

  if (step === 'complete') {
    return (
      <div className="page" style={{ maxWidth: 480, margin: '0 auto', paddingTop: 60 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(22,163,74,0.12)',
            border: '2px solid rgba(22,163,74,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M5 14l6 6 12-12" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>You're registered!</div>
          <div style={{ fontSize: 16, color: '#e8edf5', marginBottom: 6 }}>{visitorName}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            Your face has been registered successfully.<br />
            You may now use the kiosk to gain access.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 480, margin: '0 auto', paddingTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>
          Visitor Registration
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#e8edf5' }}>
          Welcome, {visitorName || 'Visitor'}
        </div>
      </div>

      <div className="card">
        <div style={{ marginBottom: 20 }}>
          {[
            { label: 'Name',   value: visitorName },
            { label: 'Email',  value: email  || '—' },
            { label: 'Mobile', value: mobile || '—' },
          ].map(row => (
            <div key={row.label} className="result-row">
              <span className="result-row-label">{row.label}</span>
              <span className="result-row-value">{row.value}</span>
            </div>
          ))}
        </div>

        <div style={{
          background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 20,
          fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6,
        }}>
          You'll be asked to look at the camera for a few seconds. Make sure you're in a well-lit area.
        </div>

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: '#f87171',
          }}>
            {error}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleTakePhoto}
          disabled={loading || !visitorName}
          style={{ width: '100%' }}
        >
          {loading
            ? <><div className="spinner" /><span>Starting…</span></>
            : <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
                  <circle cx="7" cy="7" r="2" fill="currentColor"/>
                </svg>
                Take Your Photo
              </>
          }
        </button>
      </div>
    </div>
  )
}
