import { useRef, useEffect, useState } from 'react'
import { createLivenessSession, identifyLive } from '../api/faceApi.js'
import AccessResult from './AccessResult.jsx'
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness'
import '@aws-amplify/ui-react/styles.css'

const AUTO_RESET_MS = 10000
const COUNTDOWN_START = 3

function getKioskTenantId() {
  return import.meta.env.VITE_TENANT_ID
}

export default function KioskPage() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const countdownRef = useRef(null)

  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [livenessReady, setLivenessReady] = useState(false)
  const [livenessError, setLivenessError] = useState(null)
  const [result, setResult] = useState(null)
  const [identifying, setIdentifying] = useState(false)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => {})
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  useEffect(() => {
    if (phase !== 'idle') return
    setCountdown(COUNTDOWN_START)
    let n = COUNTDOWN_START
    countdownRef.current = setInterval(() => {
      n--
      setCountdown(n)
      if (n <= 0) {
        clearInterval(countdownRef.current)
        startScan()
      }
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [phase])

  async function startScan() {
    const tenantId = getKioskTenantId()
    if (!tenantId) {
      setLivenessError('Kiosk not configured — VITE_TENANT_ID missing')
      setTimeout(handleReset, 4000)
      return
    }
    try {
      const res = await createLivenessSession('KIOSK')
      setLivenessSessionId(res.data.sessionId)
      setLivenessError(null)
      setLivenessReady(false)
      setPhase('scanning')
    } catch {
      setLivenessError('Unable to start — please try again')
      setTimeout(handleReset, 3000)
    }
  }

  useEffect(() => {
    if (phase !== 'scanning' || !livenessSessionId) return
    setLivenessReady(false)
    const t = setTimeout(() => setLivenessReady(true), 2000)
    return () => clearTimeout(t)
  }, [phase, livenessSessionId])

  async function handleLivenessComplete() {
    const tenantId = getKioskTenantId()
    setIdentifying(true)
    try {
      const res = await identifyLive({ tenantId, sessionId: livenessSessionId })
      setResult({
        data: {
          verified: res.data?.matched,
          visitorName: res.data?.visitorName,
          similarity: res.data?.similarity,
        },
      })
      setPhase('result')
      setTimeout(handleReset, AUTO_RESET_MS)
    } catch {
      setLivenessError('Unable to detect — please try again')
      setTimeout(handleReset, 4000)
    } finally {
      setIdentifying(false)
    }
  }

  function handleReset() {
    clearInterval(countdownRef.current)
    setPhase('idle')
    setCountdown(COUNTDOWN_START)
    setLivenessSessionId(null)
    setLivenessReady(false)
    setLivenessError(null)
    setResult(null)
    setIdentifying(false)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh', background: '#080e1a', overflow: 'hidden' }}>

      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: phase === 'scanning' ? 0 : 1,
          transition: 'opacity 0.3s',
        }}
      />

      {phase === 'idle' && (
        <>
          {/* Face oval guide */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -60%)',
            width: 200, height: 260,
            border: '3px solid rgba(59,130,246,0.45)',
            borderRadius: '50%',
            boxShadow: '0 0 32px rgba(59,130,246,0.15)',
            pointerEvents: 'none',
          }} />

          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
            background: 'linear-gradient(to top, rgba(8,14,26,0.95) 0%, rgba(8,14,26,0) 100%)',
            padding: '32px 24px 28px', textAlign: 'center',
          }}>
            {livenessError ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f87171', marginBottom: 4 }}>{livenessError}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Restarting…</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#e8edf5', marginBottom: 4 }}>
                  Stand in front of the camera
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                  Starting in {countdown}…
                </div>
              </>
            )}
          </div>
        </>
      )}

      {phase === 'scanning' && livenessSessionId && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: '#080e1a',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e8edf5' }}>
                {identifying ? 'Scanning face…' : 'Detecting face…'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                {identifying ? 'Please wait' : 'Please look at the camera'}
              </div>
            </div>
          </div>

          {identifying ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: '3px solid rgba(59,130,246,0.2)',
                borderTop: '3px solid #3b82f6',
                animation: 'spin 0.8s linear infinite',
              }} />
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>Processing…</div>
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
                <div style={{ fontSize: 17, fontWeight: 700, color: '#e8edf5', marginBottom: 8 }}>Getting ready…</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, maxWidth: 280 }}>
                  Colors will briefly flash on screen.<br />
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
                  onError={() => { setLivenessError('Unable to detect — please try again'); setTimeout(handleReset, 4000) }}
                  disableStartScreen
                />
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'result' && <AccessResult result={result} onReset={handleReset} />}
    </div>
  )
}
