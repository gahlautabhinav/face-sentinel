import { useRef, useEffect, useState, useCallback } from 'react'
import jsQR from 'jsqr'
import { verifyFace, createLivenessSession, getLivenessResult } from '../api/faceApi.js'
import AccessResult from './AccessResult.jsx'
import LivenessChallenge from './LivenessChallenge.jsx'

const CAPTURE_INTERVAL_MS = 1500
const AUTO_RESET_MS = 10000
const MAX_ATTEMPTS = 8

export default function KioskPage() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const streamRef = useRef(null)

  const [phase, setPhase] = useState('qr')     // 'qr' | 'liveness' | 'verifying' | 'result'
  const [qrData, setQrData] = useState(null)   // { visitorId, tenantId }
  const [result, setResult] = useState(null)
  const [attempts, setAttempts] = useState(0)
  const [status, setStatus] = useState('Show your QR code to the camera')
  const [livenessSessionId, setLivenessSessionId] = useState(null)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setStatus('Camera access denied. Please allow camera.'))

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

  // QR scan loop
  useEffect(() => {
    if (phase !== 'qr') return
    intervalRef.current = setInterval(() => {
      const frame = captureFrame()
      if (!frame) return
      const code = jsQR(frame.data, frame.width, frame.height)
      if (!code) return
      try {
        const parsed = JSON.parse(code.data)
        if (parsed.visitorId && parsed.tenantId) {
          clearInterval(intervalRef.current)
          setQrData(parsed)
          setStatus('QR scanned. Starting liveness check…')
          createLivenessSession('KIOSK')
            .then(res => {
              setLivenessSessionId(res.data.sessionId)
              setPhase('liveness')
            })
            .catch(() => setStatus('Failed to start liveness. Try again.'))
        }
      } catch {
        // not valid JSON — ignore
      }
    }, 300)
    return () => clearInterval(intervalRef.current)
  }, [phase, captureFrame])

  async function handleLivenessComplete() {
    try {
      const res = await getLivenessResult(livenessSessionId, 'KIOSK')
      if (res.data?.passed) {
        setPhase('verifying')
        setStatus('Liveness passed. Verifying identity…')
      } else {
        setStatus('Liveness check failed. Please try again.')
        setTimeout(handleReset, 4000)
      }
    } catch {
      setStatus('Liveness check error. Please try again.')
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
          const res = await verifyFace({
            tenantId: qrData.tenantId,
            visitorId: qrData.visitorId,
            imageBlob: blob,
          })
          if (res.data?.message) {
            setStatus(res.data.message)
          }
          if (!res.data?.positionError) {
            attemptCount++
            setAttempts(attemptCount)
          }
          if (res.data?.verified) {
            clearInterval(intervalRef.current)
            setResult(res)
            setPhase('result')
            setTimeout(handleReset, AUTO_RESET_MS)
          } else if (attemptCount >= MAX_ATTEMPTS) {
            clearInterval(intervalRef.current)
            setResult({ data: { verified: false } })
            setPhase('result')
            setTimeout(handleReset, AUTO_RESET_MS / 2)
          }
        } catch {
          // network error — keep trying
        }
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
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {phase === 'liveness' && livenessSessionId && (
        <div style={{
          position: 'absolute', inset: 0,
          background: '#000', zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <LivenessChallenge
            sessionId={livenessSessionId}
            region={import.meta.env.VITE_AWS_REGION || 'ap-south-1'}
            onComplete={handleLivenessComplete}
            onError={() => {
              setStatus('Liveness error. Please try again.')
              setTimeout(handleReset, 3000)
            }}
          />
        </div>
      )}

      {phase !== 'result' && phase !== 'liveness' && (
        <div style={{
          position: 'absolute', bottom: 40, left: 0, right: 0,
          textAlign: 'center', color: '#fff',
          background: 'rgba(0,0,0,0.55)', padding: '16px 24px',
        }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{status}</div>
          {phase === 'verifying' && (
            <div style={{ fontSize: 14, opacity: 0.7, marginTop: 4 }}>
              Attempt {attempts}/{MAX_ATTEMPTS}
            </div>
          )}
        </div>
      )}

      {phase === 'qr' && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 240, height: 240,
          border: '3px solid rgba(255,255,255,0.7)',
          borderRadius: 12,
        }} />
      )}

      {phase === 'result' && (
        <AccessResult result={result} onReset={handleReset} />
      )}
    </div>
  )
}
