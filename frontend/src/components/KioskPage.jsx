import { useRef, useEffect, useState } from 'react'
import { FaceDetector as MPFaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import { createLivenessSession, identifyLive, identifyFace } from '../api/faceApi.js'
import { idleState, frontFace } from '../kioskLogic.mjs'
import AccessResult from './AccessResult.jsx'
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness'
import '@aws-amplify/ui-react/styles.css'

const AUTO_RESET_MS = 10000
const COUNTDOWN_START = 3
const MEDIAPIPE_VERSION = '0.10.35'
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const FACE_DETECTOR_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const CAMERA_CONSTRAINTS = { video: { facingMode: 'user', width: 1280, height: 720 } }
const LOW_LIGHT_THRESHOLD = 30   // avg luminance 0-255; below = warn user
const LUM_CANVAS_W = 64
const LUM_CANVAS_H = 48
const DETECT_ERROR_LIMIT = 30    // consecutive failed frames before the detector counts as broken

// Message per idle state (see idleState in kioskLogic.mjs). 'ready' is rendered with the countdown.
const IDLE_TEXT = {
  no_camera: ['Camera unavailable', 'Allow camera access for this page, then retry'],
  detector_unavailable: ['Face detection offline', 'Check the network connection, or scan manually'],
  no_face: ['Stand in front of the camera', 'Scanning starts when your face is in view'],
  occluded: ['Face not clearly visible', 'Remove mask, hand or covering'],
  crowded: ['One at a time', 'Others please step back'],
  off_center: ['Move to center', 'Position your face within the brackets'],
}

const idleButtonStyle = {
  marginTop: 14, padding: '10px 32px', fontSize: 14, fontWeight: 700,
  background: 'rgba(59,130,246,0.18)', color: '#e8edf5',
  border: '1px solid rgba(59,130,246,0.55)', borderRadius: 10, cursor: 'pointer',
}

function getKioskTenantId() {
  return import.meta.env.VITE_TENANT_ID
}

// How object-fit: cover scales and offsets the video on screen.
function coverTransform(video) {
  const vw = video.videoWidth, vh = video.videoHeight
  const sw = window.innerWidth, sh = window.innerHeight
  if (vw / vh > sw / sh) {
    const scale = sh / vh
    return { scale, ox: (sw - vw * scale) / 2, oy: 0 }
  }
  const scale = sw / vw
  return { scale, ox: 0, oy: (sh - vh * scale) / 2 }
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
  const lumCanvasRef = useRef(null)
  const cameraOkRef = useRef(true)
  const detectorRef = useRef('loading')   // 'loading' | 'ready' | 'failed'
  const idleRef = useRef('no_face')
  const capturedBlobRef = useRef(null)
  const startingRef = useRef(false)
  const handleCompleteRef = useRef(false)

  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [livenessReady, setLivenessReady] = useState(false)
  const [livenessError, setLivenessError] = useState(null)
  const [result, setResult] = useState(null)
  const [identifying, setIdentifying] = useState(false)
  const [faceBox, setFaceBox] = useState(null)
  const [idle, setIdle] = useState('no_face')
  const [othersBehind, setOthersBehind] = useState(false)
  const [lowLight, setLowLight] = useState(false)

  async function acquireCamera(isCancelled = () => false) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
      if (isCancelled()) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      // Fires when the camera is unplugged or its permission revoked; our own stop() does not fire it.
      stream.getVideoTracks()[0].onended = () => {
        if (streamRef.current === stream) cameraOkRef.current = false
      }
      cameraOkRef.current = true
    } catch (e) {
      console.error('[camera] unavailable:', e)
      if (!isCancelled()) cameraOkRef.current = false
    }
  }

  async function initDetector(isCancelled = () => false) {
    detectorRef.current = 'loading'
    try {
      if (faceDetectorRef.current) { faceDetectorRef.current.close(); faceDetectorRef.current = null }
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
      const detector = await MPFaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
      })
      if (isCancelled()) { detector.close(); return }
      faceDetectorRef.current = detector
      detectorRef.current = 'ready'
    } catch (e) {
      console.error('[MediaPipe] init failed:', e)
      if (!isCancelled()) detectorRef.current = 'failed'
    }
  }

  useEffect(() => {
    const lc = document.createElement('canvas')
    lc.width = LUM_CANVAS_W; lc.height = LUM_CANVAS_H
    lumCanvasRef.current = lc

    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Keep ref in sync so captureFrameBlob can read the latest faceBox
  useEffect(() => { faceBoxRef.current = faceBox }, [faceBox])

  // Entering idle (first mount, or back from a scan): make sure camera and face detector are alive.
  // FaceLivenessDetector stops camera tracks and corrupts MediaPipe state on unmount.
  useEffect(() => {
    if (phase !== 'idle') { prevPhaseRef.current = phase; return }
    const backFromScan = prevPhaseRef.current !== 'idle'
    prevPhaseRef.current = phase

    let cancelled = false
    const isCancelled = () => cancelled

    const tracks = streamRef.current?.getTracks() || []
    if (tracks.length === 0 || tracks.some(t => t.readyState === 'ended')) acquireCamera(isCancelled)
    if (backFromScan || !faceDetectorRef.current) initDetector(isCancelled)

    return () => { cancelled = true }
  }, [phase])

  // Countdown — only advances while a single clear, centered face is in front of the camera
  useEffect(() => {
    if (phase !== 'idle') return
    if (livenessError) return
    setCountdown(COUNTDOWN_START)
    let n = COUNTDOWN_START
    countdownRef.current = setInterval(() => {
      if (idleRef.current !== 'ready') {
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

    let current = null      // smoothed on-screen box of the front face
    let detectErrors = 0
    let cancelled = false

    function tick() {
      if (cancelled) return
      const video = videoRef.current
      const videoReady = video && video.readyState >= 2
      let faces = []
      let front = null

      if (videoReady && faceDetectorRef.current) {
        try {
          const det = faceDetectorRef.current.detectForVideo(video, performance.now())
          detectErrors = 0
          faces = det.detections.map(d => ({
            area: d.boundingBox.width * d.boundingBox.height,
            score: d.categories?.[0]?.score ?? 1,
            bbox: d.boundingBox,
          }))
          // Largest face = closest person; the people behind only matter for the queue rule
          front = frontFace(faces)
        } catch (e) {
          // A detector that keeps failing must not look like an empty kiosk forever
          if (++detectErrors === DETECT_ERROR_LIMIT) {
            console.error('[MediaPipe] detectForVideo keeps failing:', e)
            detectorRef.current = 'failed'
          }
        }
      }

      if (front) {
        const { scale, ox, oy } = coverTransform(video)
        const target = {
          x: front.bbox.originX * scale + ox,
          y: front.bbox.originY * scale + oy,
          w: front.bbox.width * scale,
          h: front.bbox.height * scale,
        }
        if (!current) current = target
        const alpha = 0.2
        current = {
          x: current.x + (target.x - current.x) * alpha,
          y: current.y + (target.y - current.y) * alpha,
          w: current.w + (target.w - current.w) * alpha,
          h: current.h + (target.h - current.h) * alpha,
        }
        front.centered = isCentered(current)
        setFaceBox({ ...current })
      } else {
        current = null
        setFaceBox(null)
      }

      // One state decides both whether the countdown runs and which message shows
      const next = idleState({
        cameraOk: cameraOkRef.current,
        detector: detectorRef.current,
        faces,
        prev: idleRef.current,
      })
      idleRef.current = next
      setIdle(next)
      setOthersBehind(faces.length > 1)

      // Downsample frame for average luminance (low-light hint)
      if (videoReady && lumCanvasRef.current) {
        const ctx = lumCanvasRef.current.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0, LUM_CANVAS_W, LUM_CANVAS_H)
        const { data } = ctx.getImageData(0, 0, LUM_CANVAS_W, LUM_CANVAS_H)
        const n = LUM_CANVAS_W * LUM_CANVAS_H
        let lumSum = 0
        for (let i = 0; i < n; i++) {
          const p = i * 4
          lumSum += (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8
        }
        setLowLight(lumSum / n < LOW_LIGHT_THRESHOLD)
      }

      if (!cancelled) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [phase])

  async function startLiveness() {
    try {
      const res = await createLivenessSession('KIOSK')
      // Release our camera stream before FaceLivenessDetector acquires it.
      // Prevents concurrent getUserMedia conflict that crashes the liveness component.
      // Done only once the session exists, so a failed start leaves the idle camera running.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        if (videoRef.current) videoRef.current.srcObject = null
        streamRef.current = null
      }
      setLivenessSessionId(res.data.sessionId)
      setLivenessError(null)
      setLivenessReady(false)
      setPhase('scanning')
    } catch {
      setLivenessError('Unable to start — please try again')
      setTimeout(() => setLivenessError(null), 3000)
    }
  }

  async function captureFrameBlob() {
    const video = videoRef.current
    const box = faceBoxRef.current
    if (!video) return null
    const canvas = document.createElement('canvas')
    if (box) {
      const vw = video.videoWidth, vh = video.videoHeight
      const { scale, ox, oy } = coverTransform(video)
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
    } else {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
    }
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95))
  }

  async function startScan() {
    if (startingRef.current) return
    startingRef.current = true
    try {
      const tenantId = getKioskTenantId()
      if (!tenantId) {
        setLivenessError('Kiosk not configured — VITE_TENANT_ID missing')
        setTimeout(() => setLivenessError(null), 4000)
        return
      }
      // Capture the pre-liveness frame (face centered and stable at this point)
      if (!capturedBlobRef.current) {
        capturedBlobRef.current = await captureFrameBlob()
      }
      // Abort if something reset state while we were capturing
      if (handlingErrorRef.current) return
      await startLiveness()
    } finally {
      startingRef.current = false
    }
  }

  useEffect(() => {
    if (phase !== 'scanning' || !livenessSessionId) return
    setLivenessReady(false)
    const t = setTimeout(() => setLivenessReady(true), 800)
    return () => clearTimeout(t)
  }, [phase, livenessSessionId])

  async function handleLivenessComplete() {
    if (handleCompleteRef.current) return
    handleCompleteRef.current = true
    const tenantId = getKioskTenantId()
    setIdentifying(true)
    try {
      let matched = false
      let visitorName = null
      let similarity = 0

      // Primary: pre-captured frame (taken at n=1 tick — face centered + stable)
      // Much better angle than liveness challenge oval image
      if (capturedBlobRef.current) {
        try {
          const frameRes = await identifyFace({ tenantId, imageFile: capturedBlobRef.current })
          if (frameRes.data?.matched) {
            matched = true
            visitorName = frameRes.data.visitorName
            similarity = frameRes.data.similarity ?? 0
            console.log('[liveness] pre-captured frame matched:', similarity)
          }
        } catch { /* network error — will try liveness image next */ }
      }

      // Always call identifyLive — REQUIRED to verify liveness session result (throws if liveness failed)
      // Also acts as secondary identify using challenge image; keep if better similarity
      try {
        const liveRes = await identifyLive({ tenantId, sessionId: livenessSessionId })
        if (liveRes.data?.matched) {
          const liveSim = liveRes.data.similarity ?? 0
          if (!matched || liveSim > similarity) {
            matched = true
            visitorName = liveRes.data.visitorName
            similarity = liveSim
            console.log('[liveness] identifyLive matched:', liveSim)
          }
        }
      } catch (e) {
        // identifyLive throws when liveness session was not PASS (not a real person / challenge failed)
        // If pre-captured already found a match, liveness image just didn't match — still a real person
        if (!matched) throw e
      }

      if (!matched) {
        // Liveness passed (real person) but couldn't identify — could be bad angle, not truly not enrolled
        // Show retry message rather than "Not Enrolled" (can't distinguish the two from frontend)
        showErrorAndReset('Face not recognized — look directly at camera and try again')
        return
      }
      setResult({
        data: {
          verified: true,
          visitorName,
          similarity,
        },
      })
      setPhase('result')
      setTimeout(handleReset, AUTO_RESET_MS)
    } catch (e) {
      console.error('[Liveness] handleLivenessComplete error:', e)
      showErrorAndReset('Not a real face — please try again')
    } finally {
      setIdentifying(false)
      capturedBlobRef.current = null
    }
  }

  function handleReset() {
    clearInterval(countdownRef.current)
    cancelAnimationFrame(rafRef.current)
    idleRef.current = 'no_face'
    capturedBlobRef.current = null
    startingRef.current = false
    handleCompleteRef.current = false
    setPhase('idle')
    setCountdown(COUNTDOWN_START)
    setLivenessSessionId(null)
    setLivenessReady(false)
    setLivenessError(null)
    setResult(null)
    setIdentifying(false)
    setFaceBox(null)
    setIdle('no_face')
  }

  function showErrorAndReset(msg) {
    if (handlingErrorRef.current) return
    handlingErrorRef.current = true
    clearInterval(countdownRef.current)
    cancelAnimationFrame(rafRef.current)
    idleRef.current = 'no_face'
    capturedBlobRef.current = null
    startingRef.current = false
    handleCompleteRef.current = false
    setPhase('idle')
    setCountdown(COUNTDOWN_START)
    setLivenessSessionId(null)
    setLivenessReady(false)
    setResult(null)
    setIdentifying(false)
    setFaceBox(null)
    setIdle('no_face')
    setLivenessError(msg)
    setTimeout(() => {
      setLivenessError(null)
      handlingErrorRef.current = false
    }, 4000)
  }

  function renderCornerBrackets() {
    const faceFound = !!faceBox
    const ready = idle === 'ready'
    const box = faceBox ?? {
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 155,
      w: 200,
      h: 260,
    }
    // white: nobody there · blue: good to scan · amber: face there but something to fix
    const color = !faceFound
      ? 'rgba(255,255,255,0.7)'
      : ready
        ? '#3b82f6'
        : '#f59e0b'
    const glow = !faceFound
      ? '0 0 8px rgba(255,255,255,0.3)'
      : ready
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

  const idleProblem = idle !== 'ready' && idle !== 'no_face'
  const idleBroken = idle === 'no_camera' || idle === 'detector_unavailable'

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
                <div style={{
                  fontSize: 18, fontWeight: 600, marginBottom: 4,
                  color: idleBroken ? '#f87171' : idleProblem ? '#f59e0b' : '#e8edf5',
                }}>
                  {idle === 'ready' ? 'Hold still' : IDLE_TEXT[idle][0]}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                  {idle === 'ready'
                    ? `Starting in ${countdown}…${othersBehind ? ' · scanning the person in front' : ''}`
                    : IDLE_TEXT[idle][1]}
                </div>
                {idle === 'no_camera' && (
                  <button style={idleButtonStyle} onClick={() => acquireCamera()}>Retry camera</button>
                )}
                {idle === 'detector_unavailable' && (
                  <button style={idleButtonStyle} onClick={() => startScan()}>Tap to scan</button>
                )}
                {/* Low light is a hint, not a gate: the scan still runs */}
                {lowLight && idle !== 'no_camera' && (
                  <div style={{ fontSize: 13, color: '#f59e0b', marginTop: 8 }}>
                    Poor lighting — move to a better lit area
                  </div>
                )}
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
