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
  const faceDetectorRef = useRef(null)
  const rafRef = useRef(null)

  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [livenessReady, setLivenessReady] = useState(false)
  const [livenessError, setLivenessError] = useState(null)
  const [result, setResult] = useState(null)
  const [identifying, setIdentifying] = useState(false)
  const [faceBox, setFaceBox] = useState(null)

  // Camera + FaceDetector init
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => {})
    if ('FaceDetector' in window) {
      faceDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
    }
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Countdown auto-start in idle
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

  // Face tracking loop — idle phase only
  useEffect(() => {
    if (phase !== 'idle') {
      cancelAnimationFrame(rafRef.current)
      return
    }
    if (!faceDetectorRef.current) return

    let current = null

    async function tick() {
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        try {
          const faces = await faceDetectorRef.current.detect(video)
          if (faces.length > 0) {
            const b = faces[0].boundingBox
            const vw = video.videoWidth, vh = video.videoHeight
            const sw = window.innerWidth, sh = window.innerHeight
            const videoAspect = vw / vh
            const screenAspect = sw / sh
            let scale, ox, oy
            if (videoAspect > screenAspect) {
              scale = sh / vh; ox = (sw - vw * scale) / 2; oy = 0
            } else {
              scale = sw / vw; ox = 0; oy = (sh - vh * scale) / 2
            }
            const target = {
              x: b.x * scale + ox,
              y: b.y * scale + oy,
              w: b.width * scale,
              h: b.height * scale,
            }
            if (!current) current = target
            const alpha = 0.2
            current = {
              x: current.x + (target.x - current.x) * alpha,
              y: current.y + (target.y - current.y) * alpha,
              w: current.w + (target.w - current.w) * alpha,
              h: current.h + (target.h - current.h) * alpha,
            }
            setFaceBox({ ...current })
          } else {
            current = null
            setFaceBox(null)
          }
        } catch { /* ignore */ }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
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
    cancelAnimationFrame(rafRef.current)
    setPhase('idle')
    setCountdown(COUNTDOWN_START)
    setLivenessSessionId(null)
    setLivenessReady(false)
    setLivenessError(null)
    setResult(null)
    setIdentifying(false)
    setFaceBox(null)
  }

  // Corner brackets for idle overlay
  function renderCornerBrackets() {
    const box = faceBox ?? {
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 155,
      w: 200,
      h: 260,
    }
    const faceFound = !!faceBox
    const color = faceFound ? '#3b82f6' : 'rgba(255,255,255,0.7)'
    const glow = faceFound
      ? '0 0 10px rgba(59,130,246,0.8), 0 0 20px rgba(59,130,246,0.4)'
      : '0 0 8px rgba(255,255,255,0.3)'
    const pad = 14
    const bx = box.x - pad
    const by = box.y - pad
    const bw = box.w + pad * 2
    const bh = box.h + pad * 2
    const B = '4px'
    const corners = [
      { top: by,           left: bx,           borderTop: `${B} solid ${color}`, borderLeft:  `${B} solid ${color}`, borderRadius: '6px 0 0 0' },
      { top: by,           left: bx + bw - 48, borderTop: `${B} solid ${color}`, borderRight: `${B} solid ${color}`, borderRadius: '0 6px 0 0' },
      { top: by + bh - 48, left: bx,           borderBottom: `${B} solid ${color}`, borderLeft:  `${B} solid ${color}`, borderRadius: '0 0 0 6px' },
      { top: by + bh - 48, left: bx + bw - 48, borderBottom: `${B} solid ${color}`, borderRight: `${B} solid ${color}`, borderRadius: '0 0 6px 0' },
    ]
    return corners.map((s, i) => (
      <div key={i} style={{
        position: 'absolute', width: 48, height: 48,
        transition: 'top 0.1s ease-out, left 0.1s ease-out',
        animation: faceFound ? 'none' : 'pulse-ring 1.5s ease-out infinite',
        boxShadow: glow,
        pointerEvents: 'none',
        zIndex: 15,
        ...s,
      }} />
    ))
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
          {renderCornerBrackets()}

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
