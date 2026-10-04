import { useRef, useEffect, useState } from 'react'
import { FaceDetector as MPFaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import { createLivenessSession, identifyLive, identifyFace } from '../api/faceApi.js'
import {
  idleState, frontFace, fastPathVerdict, iou, identifyCropRect, fasCropRect,
  FAST_SAMPLE_MS, FAST_WINDOW_MS, FAST_PATH_MIN_SIMILARITY, FAST_PATH_COOLDOWN_MS, FAST_PATH_RETRY_MS, SAME_FACE_IOU,
  FAS_LIVE_MIN, FAS_MIN_CROP_SCALE, BLINK_OPEN, BLINK_CLOSED,
} from '../kioskLogic.mjs'
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
// Instant grant without the AWS challenge when the anti-spoof model and a blink both say "live"
// and the face match is strong. On unless VITE_KIOSK_FAST_PATH=false. See fastPath.js.
const FAST_PATH = import.meta.env.VITE_KIOSK_FAST_PATH !== 'false'
// Open /kiosk?debug to see, live, why the fast path is or is not firing. The thresholds in
// kioskLogic.mjs have to be tuned on the real camera, and this is the read-out for that.
const DEBUG = new URLSearchParams(window.location.search).has('debug')

// One line explaining the latest fast-path sample, for the ?debug read-out.
function describeFastPath(sample, samples, verdict, box, frame) {
  if (!sample) {
    if (fasCropRect(box, frame.width, frame.height)) return 'no sample: face landmarks not found in the crop'
    const fit = Math.min(frame.width / box.w, frame.height / box.h)
    return `no sample: face too close. Face is ${Math.round(box.h)}px of a ${frame.height}px frame, so only `
      + `${fit.toFixed(2)}x of its surroundings fit; the anti-spoof model needs ${FAS_MIN_CROP_SCALE}x. Step back.`
  }
  const closedPeak = Math.max(...samples.map(s => Math.min(s.eyeL, s.eyeR)))
  const openLow = Math.min(...samples.map(s => Math.max(s.eyeL, s.eyeR)))
  const liveLow = Math.min(...samples.map(s => s.live))
  const span = Math.round(samples[samples.length - 1].t - samples[0].t)
  return `verdict: ${verdict.reason}\n`
    + `live ${sample.live.toFixed(2)}, lowest in window ${liveLow.toFixed(2)} (need >= ${FAS_LIVE_MIN})\n`
    + `eyes now ${sample.eyeL.toFixed(2)}/${sample.eyeR.toFixed(2)}; in window: most open ${openLow.toFixed(2)} `
    + `(need <= ${BLINK_OPEN}), most closed ${closedPeak.toFixed(2)} (need >= ${BLINK_CLOSED})\n`
    + `head yaw ${sample.yaw.toFixed(0)} pitch ${sample.pitch.toFixed(0)} · ${samples.length} samples over ${span} ms`
}
const NO_MATCH_LIMIT = 2         // consecutive "real person, no match" results before "Not Enrolled"
const NO_FACE_RESET_MS = 2000    // visitor gone this long: forget their no-match count
// Longest the countdown waits for the fast-path models. Only a cold first page load comes near
// it (a 14 MB runtime download); rebuilds after a scan take well under a second.
const FAST_LOAD_GRACE_MS = 15000

// FaceLivenessDetector error states (LivenessErrorState) the kiosk explains; the rest get a generic line.
const LIVENESS_ERROR_TEXT = {
  TIMEOUT: 'Scan timed out — please try again',
  FRESHNESS_TIMEOUT: 'Scan timed out — please try again',
  MULTIPLE_FACES_ERROR: 'One at a time — others please step back',
  FACE_DISTANCE_ERROR: 'Stay still while the scan starts — please try again',
  CAMERA_ACCESS_ERROR: 'Camera problem — please try again',
  CAMERA_FRAMERATE_ERROR: 'Camera problem — please try again',
  DEFAULT_CAMERA_NOT_FOUND_ERROR: 'Camera problem — please try again',
  SERVER_ERROR: 'Connection problem — please try again',
  CONNECTION_TIMEOUT: 'Connection problem — please try again',
}

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
  const handlingErrorRef = useRef(false)
  const lumCanvasRef = useRef(null)
  const cameraOkRef = useRef(true)
  const detectorRef = useRef('loading')   // 'loading' | 'ready' | 'failed'
  const idleRef = useRef('no_face')
  const capturedBlobRef = useRef(null)
  const startingRef = useRef(false)
  const handleCompleteRef = useRef(false)
  const attemptRef = useRef(0)      // bumped on every reset; lets a late server answer be recognised as stale
  const detectorDirtyRef = useRef(false)   // FaceLivenessDetector ran: MediaPipe must be rebuilt
  // Fast path (all null/empty when the flag is off or its models could not load)
  const fastRef = useRef({ antiSpoof: null, landmarker: null, takeSample: null })
  const fastLoadingRef = useRef(false)
  const fastLoadSeqRef = useRef(0)
  const samplesRef = useRef([])
  const samplingRef = useRef(false)
  const lastSampleAtRef = useRef(0)
  const fastBlockedUntilRef = useRef(0)
  const frameCanvasRef = useRef(null)
  const noMatchRef = useRef(0)
  const resetTimerRef = useRef(null)

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
  const [fastChecking, setFastChecking] = useState(false)
  const [fastLoading, setFastLoading] = useState(false)
  const [debugText, setDebugText] = useState('')
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
      // One MediaPipe graph at a time: building the landmarker while the detector is still
      // being built left the detector stuck. The countdown waits for the fast-path models.
      if (FAST_PATH) await initFastPath(vision, isCancelled)
    } catch (e) {
      console.error('[MediaPipe] init failed:', e)
      if (!isCancelled()) detectorRef.current = 'failed'
    }
  }

  // Optional: if these models cannot load, the kiosk simply works through AWS liveness as before.
  async function initFastPath(vision, isCancelled) {
    const fast = fastRef.current
    try { fast.landmarker?.close() } catch { /* already broken */ }
    fast.landmarker = null
    // The countdown holds while this is true, otherwise it would reach the AWS scan before the
    // models are ready and the fast path would never get a turn. Bounded, so a stalled download
    // only delays the scan, never blocks it.
    // (Only the latest load may clear it: an earlier, cancelled one finishing must not.)
    const load = ++fastLoadSeqRef.current
    const doneLoading = () => { if (load === fastLoadSeqRef.current) fastLoadingRef.current = false }
    fastLoadingRef.current = true
    const giveUp = setTimeout(doneLoading, FAST_LOAD_GRACE_MS)
    try {
      const fp = await import('../fastPath.js')
      fast.takeSample = fp.takeSample
      // The anti-spoof session does not depend on MediaPipe, so it loads once, in parallel,
      // and survives the landmarker being rebuilt after every AWS scan.
      const antiSpoofLoad = fp.loadAntiSpoof().then(
        antiSpoof => { fast.antiSpoof = antiSpoof },
        e => console.error('[fast path] anti-spoof model unavailable:', e))
      const landmarker = await fp.createLandmarker(vision)
      if (isCancelled()) { landmarker.close(); return }
      fast.landmarker = landmarker
      await antiSpoofLoad
    } catch (e) {
      console.error('[fast path] unavailable, using AWS liveness only:', e)
    } finally {
      clearTimeout(giveUp)
      doneLoading()
    }
  }

  useEffect(() => {
    const lc = document.createElement('canvas')
    lc.width = LUM_CANVAS_W; lc.height = LUM_CANVAS_H
    lumCanvasRef.current = lc

    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(rafRef.current)
      clearTimeout(resetTimerRef.current)
    }
  }, [])

  // Keep ref in sync so captureFrameBlob can read the latest faceBox
  useEffect(() => { faceBoxRef.current = faceBox }, [faceBox])

  // Entering idle (first mount, or back from a scan): make sure camera and face detector are alive.
  // FaceLivenessDetector stops camera tracks and corrupts MediaPipe state on unmount.
  useEffect(() => {
    if (phase !== 'idle') return

    let cancelled = false
    const isCancelled = () => cancelled

    const tracks = streamRef.current?.getTracks() || []
    if (tracks.length === 0 || tracks.some(t => t.readyState === 'ended')) acquireCamera(isCancelled)
    if (detectorDirtyRef.current || !faceDetectorRef.current) {
      detectorDirtyRef.current = false
      initDetector(isCancelled)
    }

    return () => { cancelled = true }
  }, [phase])

  // Countdown — only advances while a single clear, centered face is in front of the camera
  useEffect(() => {
    if (phase !== 'idle') return
    if (livenessError) return
    setCountdown(COUNTDOWN_START)
    let n = COUNTDOWN_START
    countdownRef.current = setInterval(() => {
      if (idleRef.current !== 'ready' || fastLoadingRef.current) {
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
    let noFaceSince = null
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
      setFastLoading(fastLoadingRef.current)

      // A visitor who walks away takes their "not recognized" count with them.
      // Only counted while the detector works, so its reload after a scan does not look like an empty kiosk.
      if (next === 'no_face' && detectorRef.current === 'ready') {
        noFaceSince ??= performance.now()
        if (performance.now() - noFaceSince >= NO_FACE_RESET_MS) noMatchRef.current = 0
      } else {
        noFaceSince = null
      }

      // Downsample frame for average luminance (low-light hint)
      let dark = false
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
        dark = lumSum / n < LOW_LIGHT_THRESHOLD
        setLowLight(dark)
      }

      if (FAST_PATH) sampleForFastPath(video, front, next, dark)

      if (!cancelled) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [phase])

  function blockFastPath(ms) {
    fastBlockedUntilRef.current = Math.max(fastBlockedUntilRef.current, performance.now() + ms)
    samplesRef.current = []
  }

  // Fast path, called every frame from the tick. While one clear, centred face is in view it
  // gathers a sample about every FAST_SAMPLE_MS. It can only ever add a quicker grant: when the
  // samples do not justify one, nothing happens and the countdown leads to AWS liveness as usual.
  function sampleForFastPath(video, front, state, dark) {
    const fast = fastRef.current
    const now = performance.now()
    const usable = state === 'ready' && !dark && fast.antiSpoof && fast.landmarker
      && now >= fastBlockedUntilRef.current && !startingRef.current
    if (!usable) {
      samplesRef.current = []
      if (DEBUG && !startingRef.current) {
        setDebugText('fast path waiting: ' + (
          !fast.antiSpoof ? 'anti-spoof model not loaded (yet)'
            : !fast.landmarker ? 'face landmarker not loaded (yet)'
              : state !== 'ready' ? `kiosk state is "${state}", needs "ready"`
                : dark ? 'low light'
                  : `cooldown, ${Math.ceil((fastBlockedUntilRef.current - now) / 1000)} s left`))
      }
      return
    }
    if (samplingRef.current || now - lastSampleAtRef.current < FAST_SAMPLE_MS) return
    samplingRef.current = true
    lastSampleAtRef.current = now

    // Freeze this frame: the anti-spoof score, the blink reading and the image sent for
    // identification all come from it, so they are all about the same face at the same moment.
    const frame = (frameCanvasRef.current ??= document.createElement('canvas'))
    frame.width = video.videoWidth
    frame.height = video.videoHeight
    frame.getContext('2d').drawImage(video, 0, 0)
    const box = { x: front.bbox.originX, y: front.bbox.originY, w: front.bbox.width, h: front.bbox.height }
    const attempt = attemptRef.current

    fast.takeSample({ antiSpoof: fast.antiSpoof, landmarker: fast.landmarker, frame, box, t: now })
      .then(sample => {
        if (attempt !== attemptRef.current || startingRef.current) return
        const prev = samplesRef.current
        // The evidence must be one unbroken run on one face: an unusable frame or a face that
        // jumped elsewhere starts it over.
        if (!sample || (prev.length && iou(prev[prev.length - 1].box, box) < SAME_FACE_IOU)) {
          samplesRef.current = sample ? [{ ...sample, box }] : []
          if (DEBUG) setDebugText(sample ? 'face moved: sample run restarted' : describeFastPath(null, [], null, box, frame))
          return
        }
        const samples = [...prev, { ...sample, box }].filter(s => now - s.t <= FAST_WINDOW_MS)
        samplesRef.current = samples
        const verdict = fastPathVerdict(samples)
        if (DEBUG) setDebugText(describeFastPath(sample, samples, verdict, box, frame))
        if (verdict.spoof) {
          console.warn('[fast path] spoof frame, live score', sample.live.toFixed(2))
          blockFastPath(FAST_PATH_COOLDOWN_MS)
        } else if (verdict.pass) {
          return fastIdentify(frame, box)
        }
      })
      .catch(e => {
        console.error('[fast path] sample failed:', e)
        samplesRef.current = []
      })
      .finally(() => { samplingRef.current = false })
  }

  // The samples say "live". Identify from that same frame and grant only on a strong match;
  // anything less goes to the AWS liveness check.
  async function fastIdentify(frame, box) {
    const tenantId = getKioskTenantId()
    if (!tenantId || startingRef.current) return
    startingRef.current = true
    const attempt = attemptRef.current
    samplesRef.current = []
    try {
      // Cut the identification image now, before the next sample overwrites the frame
      const crop = identifyCropRect(box, frame.width, frame.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 400
      canvas.getContext('2d').drawImage(frame, crop.x, crop.y, crop.w, crop.h, 0, 0, 400, 400)
      setFastChecking(true)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95))

      let data
      try {
        data = (await identifyFace({ tenantId, imageFile: blob })).data
      } catch { /* network problem: same as "not sure" */ }
      // Reset while waiting: the reset already released the lock, and this answer is stale
      if (attempt !== attemptRef.current) return
      setFastChecking(false)
      clearInterval(countdownRef.current)

      if (data?.matched === true && Number.isFinite(data.similarity) && data.similarity >= FAST_PATH_MIN_SIMILARITY) {
        console.log('[fast path] granted, similarity', data.similarity)
        startingRef.current = false
        noMatchRef.current = 0
        showResult({ verified: true, visitorName: data.visitorName, similarity: data.similarity })
        return
      }
      // Looked live, but no match or not a strong one: AWS liveness decides, with this frame
      // as the better-angle image the server may fall back on.
      const why = data?.matched === true
        ? `match too weak for an instant grant (similarity ${data.similarity}, need >= ${FAST_PATH_MIN_SIMILARITY})`
        : 'no match from the identify call'
      console.log(`[fast path] looked live, but ${why}; using the liveness check`)
      if (DEBUG) setDebugText(`looked live, but ${why}\n-> liveness check`)
      capturedBlobRef.current = blob
      await startLiveness()
      if (attempt === attemptRef.current) startingRef.current = false
    } catch (e) {
      console.error('[fast path] identify step failed:', e)
      if (attempt === attemptRef.current) showErrorAndReset('Scan failed — please try again')
    }
  }

  async function startLiveness() {
    try {
      const res = await createLivenessSession('KIOSK')
      detectorDirtyRef.current = true
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
      // Capture the pre-liveness frame (face centered and stable at this point).
      // Always fresh: a frame kept from an earlier failed start could show a different visitor.
      capturedBlobRef.current = await captureFrameBlob()
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

  function showResult(data) {
    setResult({ data })
    setPhase('result')
    resetTimerRef.current = setTimeout(handleReset, AUTO_RESET_MS)
  }

  // FaceLivenessDetector calls this when the challenge upload finishes, whether or not it passed.
  // The server is the only judge: it checks the liveness verdict and identifies the person from
  // the liveness image. The pre-captured frame is sent along as a better-angle fallback, which
  // the server uses only if it shows the same person who passed liveness.
  async function handleLivenessComplete() {
    if (handleCompleteRef.current) return
    handleCompleteRef.current = true
    const attempt = attemptRef.current
    const frameBlob = capturedBlobRef.current
    capturedBlobRef.current = null
    setIdentifying(true)

    let res, error
    try {
      res = await identifyLive({ tenantId: getKioskTenantId(), sessionId: livenessSessionId, frameBlob })
    } catch (e) {
      error = e
    }
    // The kiosk was reset while waiting (error, timeout, manual reset): this answer belongs to
    // an abandoned scan and must not grant or deny whoever is standing there now.
    if (attempt !== attemptRef.current) return
    setIdentifying(false)

    if (error) {
      console.error('[Liveness] identify failed:', error)
      // 422 is the server saying liveness did not pass. Anything else is an outage, not a spoof.
      if (error.status === 422) showErrorAndReset('Not a real face — please try again', FAST_PATH_COOLDOWN_MS)
      else showErrorAndReset('Connection problem — please try again')
      return
    }
    if (res.data?.matched === true) {
      noMatchRef.current = 0
      showResult({ verified: true, visitorName: res.data.visitorName, similarity: res.data.similarity ?? 0 })
      return
    }
    // A real person the system does not know. One miss can be a bad angle; a second in a row
    // from the same visitor means they are not enrolled.
    noMatchRef.current++
    if (noMatchRef.current >= NO_MATCH_LIMIT) {
      noMatchRef.current = 0
      showResult({ verified: false, notEnrolled: true })
      return
    }
    showErrorAndReset('Face not recognized — look directly at camera and try again')
  }

  // The challenge did not complete. A spoof verdict never arrives here, only from the server.
  function handleLivenessError(err) {
    console.error('[Liveness] onError:', err, 'state:', err?.state)
    showErrorAndReset(LIVENESS_ERROR_TEXT[err?.state] ?? 'Scan failed — please try again')
  }

  function handleReset() {
    attemptRef.current++
    samplesRef.current = []
    setFastChecking(false)
    clearTimeout(resetTimerRef.current)
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

  function showErrorAndReset(msg, fastCooldownMs = FAST_PATH_RETRY_MS) {
    if (handlingErrorRef.current) return
    handlingErrorRef.current = true
    attemptRef.current++
    // A scan that ended without a result earns no immediate second try at the fast path
    blockFastPath(fastCooldownMs)
    setFastChecking(false)
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

      {DEBUG && FAST_PATH && debugText && (
        <div style={{
          position: 'absolute', top: 64, left: 12, zIndex: 200, maxWidth: 560,
          font: '12px/1.5 ui-monospace, Consolas, monospace', whiteSpace: 'pre-wrap',
          color: '#7dd3fc', background: 'rgba(0,0,0,0.72)', padding: '8px 12px', borderRadius: 8,
          pointerEvents: 'none',
        }}>
          {debugText}
        </div>
      )}

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
                  {idle !== 'ready'
                    ? IDLE_TEXT[idle][1]
                    : fastChecking
                      ? 'Checking…'
                      : fastLoading
                        ? 'Getting ready…'
                        : `Starting in ${countdown}…${othersBehind ? ' · scanning the person in front' : ''}`}
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
                  onError={handleLivenessError}
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
