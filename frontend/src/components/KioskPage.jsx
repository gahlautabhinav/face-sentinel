import { useRef, useEffect, useState } from 'react'
import { FaceDetector as MPFaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import { createLivenessSession, identifyLive, identifyFace } from '../api/faceApi.js'
import AccessResult from './AccessResult.jsx'
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness'
import '@aws-amplify/ui-react/styles.css'

const AUTO_RESET_MS = 10000
const COUNTDOWN_START = 3
const MEDIAPIPE_VERSION = '0.10.35'
const SKIN_RB_THRESHOLD = 1.20   // skin is warm (R>B); phone backlight is cool (R≈B or R<B)
const LOW_LIGHT_THRESHOLD = 30   // avg luminance 0-255; below = warn user
const FAST_PATH_MIN_SIMILARITY = 93.0  // below this → liveness even if matched (catches high-quality video)
const MOTION_CANVAS_W = 64
const MOTION_CANVAS_H = 48

function getKioskTenantId() {
  return import.meta.env.VITE_TENANT_ID
}

function isCentered(faceBox) {
  if (!faceBox) return true
  const cx = faceBox.x + faceBox.w / 2
  const cy = faceBox.y + faceBox.h / 2
  return (
    Math.abs(cx - window.innerWidth / 2) < window.innerWidth * 0.25 &&
    Math.abs(cy - window.innerHeight / 2) < window.innerHeight * 0.30
  )
}

export default function KioskPage() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const countdownRef = useRef(null)
  const faceDetectorRef = useRef(null)
  const rafRef = useRef(null)
  const faceBoxRef = useRef(null)
  const prevPhaseRef = useRef('idle')
  const handlingErrorRef = useRef(false)
  const motionCanvasRef = useRef(null)
  const prevPixelsRef = useRef(null)
  const motionScoreRef = useRef(0)
  const textureCanvasRef = useRef(null)
  const faceCountRef = useRef(0)
  const detectionScoreRef = useRef(1)

  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [livenessReady, setLivenessReady] = useState(false)
  const [livenessError, setLivenessError] = useState(null)
  const [result, setResult] = useState(null)
  const [identifying, setIdentifying] = useState(false)
  const [faceBox, setFaceBox] = useState(null)
  const [faceCount, setFaceCount] = useState(0)
  const [lowLight, setLowLight] = useState(false)
  const [faceOccluded, setFaceOccluded] = useState(false)

  // Camera + MediaPipe init
  useEffect(() => {
    const mc = document.createElement('canvas')
    mc.width = MOTION_CANVAS_W; mc.height = MOTION_CANVAS_H
    motionCanvasRef.current = mc
    const tc = document.createElement('canvas')
    textureCanvasRef.current = tc

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => { })

    let mounted = true
    async function initDetector() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
        )
        if (!mounted) return
        faceDetectorRef.current = await MPFaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
        })
      } catch { /* face detection unavailable — brackets stay centered */ }
    }
    initDetector()

    return () => {
      mounted = false
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Keep ref in sync so countdown interval can read latest faceBox
  useEffect(() => { faceBoxRef.current = faceBox }, [faceBox])

  // On return from scanning: reinit camera stream if dead + reinit MediaPipe detector
  // FaceLivenessDetector stops camera tracks and corrupts MediaPipe state on unmount
  useEffect(() => {
    if (phase !== 'idle') { prevPhaseRef.current = phase; return }
    const comingFromScan = prevPhaseRef.current === 'scanning'
    prevPhaseRef.current = phase

    const tracks = streamRef.current?.getTracks() || []
    if (tracks.length === 0 || tracks.some(t => t.readyState === 'ended')) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } })
        .then(stream => {
          streamRef.current = stream
          if (videoRef.current) videoRef.current.srcObject = stream
        })
        .catch(() => { })
    }

    if (comingFromScan) {
      async function reinitDetector() {
        console.log('[MediaPipe] reinit start')
        try {
          if (faceDetectorRef.current) { faceDetectorRef.current.close(); faceDetectorRef.current = null }
          const vision = await FilesetResolver.forVisionTasks(
            `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
          )
          faceDetectorRef.current = await MPFaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
          })
          console.log('[MediaPipe] reinit done')
        } catch (e) { console.error('[MediaPipe] reinit failed:', e) }
      }
      reinitDetector()
    }
  }, [phase])

  // Countdown — pauses and resets when face detected but off-center
  useEffect(() => {
    if (phase !== 'idle') return
    if (livenessError) return
    setCountdown(COUNTDOWN_START)
    let n = COUNTDOWN_START
    countdownRef.current = setInterval(() => {
      const box = faceBoxRef.current
      if (faceCountRef.current > 1) {
        n = COUNTDOWN_START
        setCountdown(COUNTDOWN_START)
        return
      }
      if (detectionScoreRef.current < 0.65) {
        n = COUNTDOWN_START
        setCountdown(COUNTDOWN_START)
        return
      }
      if (box && !isCentered(box)) {
        n = COUNTDOWN_START
        setCountdown(COUNTDOWN_START)
        return
      }
      n--
      setCountdown(n)
      if (n <= 0) {
        clearInterval(countdownRef.current)
        startScan()
      }
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [phase, livenessError])

  // Face tracking RAF loop — idle phase only
  useEffect(() => {
    if (phase !== 'idle') {
      cancelAnimationFrame(rafRef.current)
      return
    }

    let current = null
    let cancelled = false

    function tick() {
      if (cancelled) return
      const video = videoRef.current
      if (video && video.readyState >= 2 && faceDetectorRef.current) {
        try {
          const det = faceDetectorRef.current.detectForVideo(video, performance.now())
          const count = det.detections.length
          faceCountRef.current = count
          setFaceCount(count)
          if (count > 0) {
            // Pick largest face (closest to camera) for queue ordering
            const largest = det.detections.reduce((best, d) =>
              d.boundingBox.width * d.boundingBox.height > best.boundingBox.width * best.boundingBox.height ? d : best
            )
            const score = largest.categories?.[0]?.score ?? 1
            detectionScoreRef.current = score
            setFaceOccluded(score < 0.65)
            const bbox = largest.boundingBox
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
              x: bbox.originX * scale + ox,
              y: bbox.originY * scale + oy,
              w: bbox.width * scale,
              h: bbox.height * scale,
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
            detectionScoreRef.current = 1
            setFaceOccluded(false)
            current = null
            setFaceBox(null)
          }
        } catch (e) { console.warn('[MediaPipe] detectForVideo error:', e) }
      }

      // Downsample frame for motion + luminance
      if (video && video.readyState >= 2 && motionCanvasRef.current) {
        const mc = motionCanvasRef.current
        const ctx = mc.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0, MOTION_CANVAS_W, MOTION_CANVAS_H)
        const { data } = ctx.getImageData(0, 0, MOTION_CANVAS_W, MOTION_CANVAS_H)
        const n = MOTION_CANVAS_W * MOTION_CANVAS_H
        const curr = new Uint8Array(n)
        let lumSum = 0
        for (let i = 0; i < n; i++) {
          const p = i * 4
          const lum = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8
          curr[i] = lum
          lumSum += lum
        }
        // Low light detection
        setLowLight(lumSum / n < LOW_LIGHT_THRESHOLD)
        // Motion EMA
        if (prevPixelsRef.current) {
          let diff = 0
          for (let i = 0; i < n; i++) {
            if (Math.abs(curr[i] - prevPixelsRef.current[i]) > 20) diff++
          }
          motionScoreRef.current = motionScoreRef.current * 0.7 + (diff / n) * 0.3
        }
        prevPixelsRef.current = curr
      }

      if (!cancelled) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [phase])

  function computeFaceFeatures() {
    const video = videoRef.current
    const box = faceBoxRef.current
    if (!video || !box || !textureCanvasRef.current) return { variance: Infinity, rbRatio: 0 }
    const vw = video.videoWidth, vh = video.videoHeight
    const sw = window.innerWidth, sh = window.innerHeight
    const videoAspect = vw / vh, screenAspect = sw / sh
    let scale, ox, oy
    if (videoAspect > screenAspect) {
      scale = sh / vh; ox = (sw - vw * scale) / 2; oy = 0
    } else {
      scale = sw / vw; ox = 0; oy = (sh - vh * scale) / 2
    }
    const fx = Math.max(0, (box.x - ox) / scale)
    const fy = Math.max(0, (box.y - oy) / scale)
    const fw = Math.min(box.w / scale, vw - fx)
    const fh = Math.min(box.h / scale, vh - fy)
    if (fw < 20 || fh < 20) return { variance: Infinity, rbRatio: 0 }
    const tc = textureCanvasRef.current
    tc.width = 32; tc.height = 32
    const ctx = tc.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, fx, fy, fw, fh, 0, 0, 32, 32)
    const { data } = ctx.getImageData(0, 0, 32, 32)
    const n = 32 * 32
    let sum = 0, sumSq = 0, sumR = 0, sumB = 0
    for (let i = 0; i < n; i++) {
      const p = i * 4
      const lum = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8
      sum += lum
      sumSq += lum * lum
      sumR += data[p]
      sumB += data[p + 2]
    }
    const mean = sum / n
    const variance = sumSq / n - mean * mean
    const rbRatio = sumB > 0 ? sumR / sumB : 0
    return { variance, rbRatio }
  }

  async function startLiveness() {
    try {
      const res = await createLivenessSession('KIOSK')
      setLivenessSessionId(res.data.sessionId)
      setLivenessError(null)
      setLivenessReady(false)
      setPhase('scanning')
    } catch {
      setLivenessError('Unable to start — please try again')
      setTimeout(() => setLivenessError(null), 3000)
    }
  }

  async function startScan() {
    const tenantId = getKioskTenantId()
    if (!tenantId) {
      setLivenessError('Kiosk not configured — VITE_TENANT_ID missing')
      setTimeout(() => setLivenessError(null), 4000)
      return
    }
    if (detectionScoreRef.current < 0.65) {
      // Face occluded — countdown should have paused this but guard defensively
      return
    }
    const { variance, rbRatio } = computeFaceFeatures()
    const looksReal = rbRatio > SKIN_RB_THRESHOLD
    console.log('[scan] score:', detectionScoreRef.current.toFixed(2), 'rbRatio:', rbRatio.toFixed(2), 'texture:', Math.round(variance), 'looksReal:', looksReal)
    if (looksReal) {
      await captureAndIdentify(tenantId)
    } else {
      await startLiveness()
    }
  }

  async function captureAndIdentify(tenantId) {
    const video = videoRef.current
    if (!video) return
    setPhase('scanning')
    await new Promise(resolve => setTimeout(resolve, 800))
    setIdentifying(true)
    try {
      const canvas = document.createElement('canvas')
      const box = faceBoxRef.current
      if (box) {
        // Crop face region in video-space and upscale to 400×400 for Rekognition
        const vw = video.videoWidth, vh = video.videoHeight
        const sw = window.innerWidth, sh = window.innerHeight
        const videoAspect = vw / vh, screenAspect = sw / sh
        let scale, ox, oy
        if (videoAspect > screenAspect) {
          scale = sh / vh; ox = (sw - vw * scale) / 2; oy = 0
        } else {
          scale = sw / vw; ox = 0; oy = (sh - vh * scale) / 2
        }
        // Crop face + 20% padding, clamp properly to video bounds
        const padX = box.w * 0.2, padY = box.h * 0.2
        let fx = (box.x - padX - ox) / scale
        let fy = (box.y - padY - oy) / scale
        let fw = (box.w + padX * 2) / scale
        let fh = (box.h + padY * 2) / scale
        if (fx < 0) { fw += fx; fx = 0 }
        if (fy < 0) { fh += fy; fy = 0 }
        fw = Math.min(fw, vw - fx)
        fh = Math.min(fh, vh - fy)
        canvas.width = 400; canvas.height = 400
        canvas.getContext('2d').drawImage(video, fx, fy, fw, fh, 0, 0, 400, 400)
        console.log('[identify] face crop:', Math.round(fx), Math.round(fy), Math.round(fw), Math.round(fh))
      } else {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d').drawImage(video, 0, 0)
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95))
      const res = await identifyFace({ tenantId, imageFile: blob })
      const matched = res.data?.matched
      const similarity = res.data?.similarity ?? 0
      console.log('[identify] matched:', matched, 'similarity:', similarity.toFixed(1), 'visitor:', res.data?.visitorName)
      if (matched && similarity >= FAST_PATH_MIN_SIMILARITY) {
        // High-confidence match — real person, grant directly
        setResult({
          data: {
            verified: true,
            visitorName: res.data.visitorName,
            similarity,
          },
        })
        setPhase('result')
        setTimeout(handleReset, AUTO_RESET_MS)
      } else {
        // No match OR borderline similarity (high-quality video risk) → liveness
        setIdentifying(false)
        await startLiveness()
      }
    } catch {
      showErrorAndReset('Unable to identify — please try again')
    } finally {
      setIdentifying(false)
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
          notEnrolled: !res.data?.matched, // liveness passed = real person, no match = not enrolled
        },
      })
      setPhase('result')
      setTimeout(handleReset, AUTO_RESET_MS)
    } catch (e) {
      console.error('[Liveness] handleLivenessComplete error:', e)
      showErrorAndReset('Not a real face — please try again')
    } finally {
      setIdentifying(false)
    }
  }

  function handleReset() {
    clearInterval(countdownRef.current)
    cancelAnimationFrame(rafRef.current)
    motionScoreRef.current = 0
    prevPixelsRef.current = null
    faceCountRef.current = 0
    setPhase('idle')
    setCountdown(COUNTDOWN_START)
    setLivenessSessionId(null)
    setLivenessReady(false)
    setLivenessError(null)
    setResult(null)
    setIdentifying(false)
    setFaceBox(null)
    setFaceCount(0)
  }

  function showErrorAndReset(msg) {
    if (handlingErrorRef.current) return
    handlingErrorRef.current = true
    clearInterval(countdownRef.current)
    cancelAnimationFrame(rafRef.current)
    motionScoreRef.current = 0
    prevPixelsRef.current = null
    faceCountRef.current = 0
    setPhase('idle')
    setCountdown(COUNTDOWN_START)
    setLivenessSessionId(null)
    setLivenessReady(false)
    setResult(null)
    setIdentifying(false)
    setFaceBox(null)
    setFaceCount(0)
    setLivenessError(msg)
    setTimeout(() => {
      setLivenessError(null)
      handlingErrorRef.current = false
    }, 4000)
  }

  function renderCornerBrackets() {
    const faceFound = !!faceBox
    const centered = isCentered(faceBox)
    const box = faceBox ?? {
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 155,
      w: 200,
      h: 260,
    }
    const color = !faceFound
      ? 'rgba(255,255,255,0.7)'
      : centered
        ? '#3b82f6'
        : '#f59e0b'
    const glow = !faceFound
      ? '0 0 8px rgba(255,255,255,0.3)'
      : centered
        ? '0 0 10px rgba(59,130,246,0.8), 0 0 20px rgba(59,130,246,0.4)'
        : '0 0 10px rgba(245,158,11,0.8), 0 0 20px rgba(245,158,11,0.4)'
    const pad = 14
    const bx = box.x - pad
    const by = box.y - pad
    const bw = box.w + pad * 2
    const bh = box.h + pad * 2
    const B = '4px'
    const corners = [
      { top: by, left: bx, borderTop: `${B} solid ${color}`, borderLeft: `${B} solid ${color}`, borderRadius: '6px 0 0 0' },
      { top: by, left: bx + bw - 48, borderTop: `${B} solid ${color}`, borderRight: `${B} solid ${color}`, borderRadius: '0 6px 0 0' },
      { top: by + bh - 48, left: bx, borderBottom: `${B} solid ${color}`, borderLeft: `${B} solid ${color}`, borderRadius: '0 0 0 6px' },
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

  const faceFound = !!faceBox
  const centered = isCentered(faceBox)

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
            ) : lowLight ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>Poor lighting</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                  Move to a better lit area
                </div>
              </>
            ) : faceOccluded ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>
                  Face not clearly visible
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                  Remove mask, hand or covering
                </div>
              </>
            ) : faceCount > 1 ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>
                  Multiple people detected
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                  Please queue — scanning closest person first
                </div>
              </>
            ) : faceFound && !centered ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>
                  Move to center
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                  Position your face within the brackets
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#e8edf5', marginBottom: 4 }}>
                  {faceFound ? 'Hold still' : 'Stand in front of the camera'}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                  Starting in {countdown}…
                </div>
              </>
            )}
          </div>
        </>
      )}

      {phase === 'scanning' && (livenessSessionId || identifying) && (
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
                  <circle cx="14" cy="14" r="5" fill="#3b82f6" />
                  <circle cx="14" cy="14" r="10" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 3" />
                </svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#e8edf5', marginBottom: 8 }}>Getting ready…</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, maxWidth: 280 }}>
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
                  onError={(err) => {
                    console.error('[Liveness] onError:', err, 'state:', err?.state)
                    const state = err?.state ?? ''
                    const msg = (state === 'TIMEOUT' || state === 'FACE_FIT_TIMEOUT')
                      ? 'Scan timed out — please try again'
                      : 'Not a real face — please try again'
                    showErrorAndReset(msg)
                  }}
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
