import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import ResultBox from './ResultBox.jsx'
import LivenessChallenge from './LivenessChallenge.jsx'
import { createLivenessSession, enrollLive } from '../api/faceApi.js'

const STEP_ORDER = ['details', 'liveness', 'complete']
const STEP_LABELS = { details: 'Details', liveness: 'Liveness', complete: 'Complete' }

function StepBar({ step }) {
  const currentIdx = STEP_ORDER.indexOf(step)
  return (
    <div className="steps">
      {STEP_ORDER.map((id, i) => {
        const isDone = i < currentIdx
        const isActive = i === currentIdx
        return (
          <div key={id} className={`step${isDone ? ' done' : isActive ? ' active' : ''}`}>
            <div className="step-dot">
              {isDone
                ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7l3 3 5-5" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                : i + 1
              }
            </div>
            <div className="step-label">{STEP_LABELS[id]}</div>
          </div>
        )
      })}
    </div>
  )
}

function getOrgTenantId() {
  if (import.meta.env.VITE_TENANT_ID) return import.meta.env.VITE_TENANT_ID
  const stored = localStorage.getItem('lbfr_tenant_id')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('lbfr_tenant_id', id)
  return id
}

function uuidToBase64url(uuid) {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export default function EnrollPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [showLiveness, setShowLiveness] = useState(false)
  const [step, setStep] = useState('details')
  const [enrolledData, setEnrolledData] = useState(null)

  async function handleStartLiveness(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await createLivenessSession('ADMIN')
      setLivenessSessionId(res.data.sessionId)
      setShowLiveness(true)
      setStep('liveness')
    } catch {
      setResult({ success: false, message: 'Failed to start liveness check. Try again.' })
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
        visitorName: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
      })
      setResult(data)
      if (data.success !== false) {
        setEnrolledData({
          tenantId,
          visitorId: data.data?.visitorId,
          name: name.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
        })
        setStep('complete')
      } else {
        setStep('details')
      }
    } catch (err) {
      setResult({ success: false, message: err.message })
      setStep('details')
    } finally {
      setLoading(false)
      setLivenessSessionId(null)
    }
  }

  function handleLivenessError() {
    setShowLiveness(false)
    setLivenessSessionId(null)
    setStep('details')
    setResult({ success: false, message: 'Liveness check failed — please try again.' })
  }

  function handleReset() {
    setStep('details')
    setResult(null)
    setName('')
    setEmail('')
    setMobile('')
    setEnrolledData(null)
  }

  function downloadQR() {
    const canvas = document.getElementById('enrollment-qr')
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.download = `visitor-qr-${enrolledData.visitorId.slice(0, 8)}.png`
    a.href = url
    a.click()
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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8edf5' }}>Liveness Check</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              Follow the oval with your face
            </div>
          </div>
          <button
            onClick={() => { setShowLiveness(false); setLivenessSessionId(null); setStep('details') }}
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

  return (
    <div className="page">
      <div className="page-title">Enroll Visitor</div>
      <div className="page-sub">Enter visitor details. IDs are auto-generated. Complete liveness check to register face and get QR code.</div>

      <StepBar step={step} />

      <div className="card">
        {step === 'complete' && enrolledData ? (
          <div>
            {/* Success header */}
            <div style={{ textAlign: 'center', paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 0 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'rgba(22,163,74,0.12)',
                border: '2px solid rgba(22,163,74,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
                animation: 'scaleIn 0.25s ease-out',
              }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M4 11l5 5 9-9" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#4ade80', marginBottom: 2 }}>Enrolled Successfully</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>{enrolledData.name}</div>
            </div>

            {/* QR code */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <QRCodeCanvas
                  id="enrollment-qr"
                  value={JSON.stringify({ v: uuidToBase64url(enrolledData.visitorId) })}
                  size={200}
                  level="L"
                  marginSize={4}
                />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 14, textAlign: 'center' }}>
                Visitor scans this QR at the kiosk
              </div>
              <button
                onClick={downloadQR}
                style={{
                  background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)',
                  color: '#93c5fd', borderRadius: 8, padding: '8px 20px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1.5 10v1a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Download QR
              </button>
            </div>

            {/* Visitor details */}
            <div style={{ padding: '16px 0 8px' }}>
              {[
                { label: 'Name',       value: enrolledData.name },
                { label: 'Email',      value: enrolledData.email  || '—' },
                { label: 'Mobile',     value: enrolledData.mobile || '—' },
                { label: 'Visitor ID', value: enrolledData.visitorId },
                { label: 'Tenant ID',  value: enrolledData.tenantId },
              ].map(row => (
                <div key={row.label} className="result-row">
                  <span className="result-row-label">{row.label}</span>
                  <span className="result-row-value">{row.value}</span>
                </div>
              ))}
            </div>

            <button className="btn-primary" onClick={handleReset} style={{ width: '100%', marginTop: 16 }}>
              Enroll Another Visitor
            </button>
          </div>
        ) : (
          <form onSubmit={handleStartLiveness}>
            <div className="field">
              <label>
                Full Name
                <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="field">
              <label>Mobile Number</label>
              <input
                type="tel"
                value={mobile}
                onChange={e => setMobile(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <div style={{
              background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 18,
              fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6,
            }}>
              Visitor ID and Tenant ID are auto-generated after successful enrollment.
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !name.trim()}
              style={{ width: '100%' }}
            >
              {loading
                ? <><div className="spinner" /><span>Starting…</span></>
                : <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="7" cy="7" r="2.5" fill="currentColor"/>
                    </svg>
                    Start Liveness Check
                  </>
              }
            </button>
            {result && <ResultBox result={result} />}
          </form>
        )}
      </div>
    </div>
  )
}
