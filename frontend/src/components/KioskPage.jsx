import { useRef, useEffect, useState, useCallback } from 'react'
import jsQR from 'jsqr'
import { verifyFace, createLivenessSession, getLivenessResult } from '../api/faceApi.js'
import AccessResult from './AccessResult.jsx'
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness'
import '@aws-amplify/ui-react/styles.css'

const CAPTURE_INTERVAL_MS = 1500
const AUTO_RESET_MS = 10000
const MAX_ATTEMPTS = 8

function base64urlToUuid(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4)
  const binary = atob(padded)
  const hex = Array.from(binary).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

function parseQrPayload(raw) {
  try {
    const parsed = JSON.parse(raw)
    // New compact format: {v: base64url}
    if (parsed.v && !parsed.visitorId && !parsed.t) {
      const visitorId = base64urlToUuid(parsed.v)
      const tenantId = import.meta.env.VITE_TENANT_ID
      if (!tenantId) return null
      return { tenantId, visitorId }
    }
    // Short-key format: {t, v} both UUIDs
    if (parsed.t && parsed.v) return { tenantId: parsed.t, visitorId: parsed.v }
    // Long-key format: {tenantId, visitorId}
    if (parsed.tenantId && parsed.visitorId) return { tenantId: parsed.tenantId, visitorId: parsed.visitorId }
  } catch { /* not JSON */ }
  return null
}

// Step config
const STEPS = [
  { id: 'qr',       label: 'Scan QR',  num: 1 },
  { id: 'liveness', label: 'Liveness', num: 2 },
  { id: 'verifying',label: 'Verify',   num: 3 },
]

function StepBar({ phase }) {
  const donePhases = { qr: [], liveness: ['qr'], verifying: ['qr', 'liveness'], result: ['qr', 'liveness', 'verifying'] }
  const done = donePhases[phase] || []
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
      background: 'linear-gradient(to bottom, rgba(8,14,26,0.95) 0%, rgba(8,14,26,0) 100%)',
      padding: '16px 24px 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0,
    }}>
      {STEPS.map((s, i) => {
        const isActive = phase === s.id
        const isDone = done.includes(s.id)
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                border: `2px solid ${isDone ? '#16a34a' : isActive ? '#3b82f6' : 'rgba(255,255,255,0.15)'}`,
                background: isDone ? 'rgba(22,163,74,0.15)' : isActive ? 'rgba(37,99,235,0.2)' : 'rgba(255,255,255,0.05)',
                color: isDone ? '#4ade80' : isActive ? '#93c5fd' : 'rgba(255,255,255,0.3)',
                boxShadow: isActive ? '0 0 12px rgba(37,99,235,0.4)' : 'none',
                transition: 'all 0.3s',
              }}>
                {isDone
                  ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : s.num
                }
              </div>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: isDone ? '#4ade80' : isActive ? '#93c5fd' : 'rgba(255,255,255,0.25)',
                letterSpacing: 0.5, textTransform: 'uppercase',
                transition: 'color 0.3s',
              }}>{s.label}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                width: 48, height: 1, margin: '-16px 8px 0',
                background: isDone ? 'rgba(22,163,74,0.5)' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.3s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatusBar({ children, sub }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
      background: 'linear-gradient(to top, rgba(8,14,26,0.95) 0%, rgba(8,14,26,0) 100%)',
      padding: '28px 24px 24px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#e8edf5' }}>{children}</div>
      {sub && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function KioskPage() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const qrCanvasRef = useRef(null)
  const intervalRef = useRef(null)
  const streamRef = useRef(null)
  const barcodeDetectorRef = useRef(
    'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null
  )

  const [phase, setPhase] = useState('qr')
  const [qrData, setQrData] = useState(null)
  const [result, setResult] = useState(null)
  const [attempts, setAttempts] = useState(0)
  const [status, setStatus] = useState('Show your QR code to the camera')
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [livenessError, setLivenessError] = useState(null)
  const [livenessReady, setLivenessReady] = useState(false)
  const [scanTick, setScanTick] = useState(0)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setStatus('Camera access denied'))
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      clearInterval(intervalRef.current)
    }
  }, [])

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return null
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }, [])

  // QR scan loop — BarcodeDetector (native/GPU, Chrome) → jsQR full-res fallback
  useEffect(() => {
    if (phase !== 'qr') return
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current
      const qc = qrCanvasRef.current
      if (!video || !qc || video.readyState < 2) return

      setScanTick(t => t + 1)
      let rawValue = null

      // Primary: native BarcodeDetector (Chrome/Edge — handles phone screens natively)
      if (barcodeDetectorRef.current) {
        try {
          const codes = await barcodeDetectorRef.current.detect(video)
          if (codes.length > 0) rawValue = codes[0].rawValue
        } catch { /* ignore */ }
      }

      // Fallback: jsQR at full video resolution with contrast boost
      if (!rawValue) {
        const vw = video.videoWidth || 1280
        const vh = video.videoHeight || 720
        qc.width = vw; qc.height = vh
        const ctx = qc.getContext('2d')
        ctx.filter = 'contrast(250%) grayscale(100%)'
        ctx.drawImage(video, 0, 0, vw, vh)
        ctx.filter = 'none'
        const img = ctx.getImageData(0, 0, vw, vh)
        const code = jsQR(img.data, vw, vh, { inversionAttempts: 'attemptBoth' })
        if (code?.data) rawValue = code.data
      }

      if (!rawValue) return

      const parsed = parseQrPayload(rawValue)
      if (!parsed) { setStatus('QR scanned but not a LogBook360 QR — try again'); return }

      clearInterval(intervalRef.current)
      setQrData(parsed)
      setStatus('QR detected — starting liveness check…')
      createLivenessSession('KIOSK')
        .then(res => {
          setLivenessSessionId(res.data.sessionId)
          setLivenessError(null)
          setPhase('liveness')
        })
        .catch(() => {
          setStatus('Failed to start liveness. Try again.')
          setTimeout(handleReset, 3000)
        })
    }, 300)
    return () => clearInterval(intervalRef.current)
  }, [phase])

  // 2.5s prep screen before liveness starts
  useEffect(() => {
    if (phase !== 'liveness' || !livenessSessionId) return
    setLivenessReady(false)
    const t = setTimeout(() => setLivenessReady(true), 2500)
    return () => clearTimeout(t)
  }, [phase, livenessSessionId])

  async function handleLivenessComplete() {
    try {
      const res = await getLivenessResult(livenessSessionId, 'KIOSK')
      if (res.data?.passed) {
        setPhase('verifying')
        setStatus('Liveness passed — verifying identity…')
      } else {
        setLivenessError('Liveness check failed — please try again.')
        setTimeout(handleReset, 4000)
      }
    } catch {
      setLivenessError('Liveness error — please try again.')
      setTimeout(handleReset, 4000)
    }
  }

  // Face verify loop
  useEffect(() => {
    if (phase !== 'verifying' || !qrData) return
    let attemptCount = 0
    intervalRef.current = setInterval(() => {
      const frame = captureFrame()
      if (!frame) return
      const canvas = canvasRef.current
      canvas.toBlob(async blob => {
        if (!blob) return
        try {
          const res = await verifyFace({ tenantId: qrData.tenantId, visitorId: qrData.visitorId, imageBlob: blob })
          if (res.data?.message) setStatus(res.data.message)
          if (!res.data?.positionError) { attemptCount++; setAttempts(attemptCount) }
          if (res.data?.verified) {
            clearInterval(intervalRef.current)
            setResult({ ...res, data: { ...res.data, visitorName: qrData?.name } })
            setPhase('result')
            setTimeout(handleReset, AUTO_RESET_MS)
          } else if (attemptCount >= MAX_ATTEMPTS) {
            clearInterval(intervalRef.current)
            setResult({ data: { verified: false } })
            setPhase('result')
            setTimeout(handleReset, AUTO_RESET_MS / 2)
          }
        } catch { /* keep trying */ }
      }, 'image/jpeg', 0.85)
    }, CAPTURE_INTERVAL_MS)
    return () => clearInterval(intervalRef.current)
  }, [phase, qrData, captureFrame])

  function handleReset() {
    clearInterval(intervalRef.current)
    setPhase('qr')
    setQrData(null)
    setResult(null)
    setAttempts(0)
    setStatus('Show your QR code to the camera')
    setLivenessSessionId(null)
    setLivenessError(null)
    setLivenessReady(false)
    setScanTick(0)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh', background: '#080e1a', overflow: 'hidden' }}>

      {/* Camera (hidden during liveness — Amplify controls its own feed) */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: phase === 'liveness' ? 0 : 1,
          transition: 'opacity 0.3s',
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={qrCanvasRef} style={{ display: 'none' }} />

      {/* Step bar (always visible except result) */}
      {phase !== 'result' && <StepBar phase={phase} />}

      {/* QR guide box */}
      {phase === 'qr' && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 240, height: 240,
          borderRadius: 16,
        }}>
          {/* Corner brackets */}
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              position: 'absolute',
              top: i < 2 ? 0 : 'auto', bottom: i >= 2 ? 0 : 'auto',
              left: i % 2 === 0 ? 0 : 'auto', right: i % 2 === 1 ? 0 : 'auto',
              width: 44, height: 44,
              borderTop: i < 2 ? '5px solid #3b82f6' : 'none',
              borderBottom: i >= 2 ? '5px solid #3b82f6' : 'none',
              borderLeft: i % 2 === 0 ? '5px solid #3b82f6' : 'none',
              borderRight: i % 2 === 1 ? '5px solid #3b82f6' : 'none',
              borderRadius: i === 0 ? '10px 0 0 0' : i === 1 ? '0 10px 0 0' : i === 2 ? '0 0 0 10px' : '0 0 10px 0',
            }} />
          ))}
        </div>
      )}

      {/* Liveness phase overlay */}
      {phase === 'liveness' && livenessSessionId && (
        <div className="kiosk-liveness-overlay" style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: '#080e1a',
          display: 'flex', flexDirection: 'column',
          paddingTop: 80,
        }}>
          {livenessError ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
            }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="22" stroke="#dc2626" strokeWidth="2"/>
                <path d="M16 16l16 16M32 16L16 32" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <div style={{ color: '#f87171', fontSize: 16, fontWeight: 600 }}>{livenessError}</div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Resetting in a moment…</div>
            </div>
          ) : !livenessReady ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                border: '3px solid rgba(59,130,246,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'pulse-ring 1.2s ease-out infinite',
              }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="5" fill="#3b82f6"/>
                  <circle cx="14" cy="14" r="10" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 3"/>
                </svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#e8edf5', marginBottom: 8 }}>
                  Liveness Check Starting…
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, maxWidth: 280 }}>
                  Colors will briefly flash on screen.<br/>
                  Hold still and look directly at the camera.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 400 }}>
                <FaceLivenessDetector
                  sessionId={livenessSessionId}
                  region={import.meta.env.VITE_AWS_REGION || 'ap-south-1'}
                  onAnalysisComplete={handleLivenessComplete}
                  onError={() => setLivenessError('Liveness error — please try again.')}
                  disableStartScreen
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Verifying overlay — attempt dots */}
      {phase === 'verifying' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'linear-gradient(to top, rgba(8,14,26,0.97) 0%, rgba(8,14,26,0) 100%)',
          padding: '32px 24px 28px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#e8edf5', marginBottom: 12 }}>{status}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i < attempts ? '#3b82f6' : 'rgba(255,255,255,0.15)',
                transition: 'background 0.3s',
                boxShadow: i < attempts ? '0 0 6px rgba(59,130,246,0.6)' : 'none',
              }} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
            Attempt {attempts} of {MAX_ATTEMPTS}
          </div>
        </div>
      )}

      {/* QR status bar */}
      {phase === 'qr' && (
        <StatusBar sub={`Hold steady — scanning continuously · #${scanTick}`}>{status}</StatusBar>
      )}

      {/* Result */}
      {phase === 'result' && <AccessResult result={result} onReset={handleReset} />}
    </div>
  )
}
