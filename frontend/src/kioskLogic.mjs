// Pure decision logic for the kiosk. No React and no DOM, so it runs under plain node:
//   npm run check   (frontend/src/kioskLogic.check.mjs)
//
// Every comparison is written so that a missing or NaN value fails closed.

// --- Idle gate -------------------------------------------------------------------------------

export const OCCLUDED_SCORE = 0.65    // MediaPipe detection score below this: face is covered
export const QUEUE_AREA_RATIO = 0.4   // to start: every other face at most this fraction of the front face's area
export const QUEUE_EXIT_RATIO = 0.55  // once a front person is established: tolerated up to this (hysteresis)

const FRONT_ESTABLISHED = new Set(['ready', 'off_center', 'occluded'])

// faces: [{ area, score, centered }]. Returns the largest (closest) face, or null.
export function frontFace(faces) {
  const real = (faces ?? []).filter(Boolean)
  if (!real.length) return null
  return real.reduce((best, f) => (f.area > best.area ? f : best))
}

// One state drives both the countdown gate and the on-screen message.
// detector: 'loading' | 'ready' | 'failed'. prev: the state returned last time (for hysteresis).
export function idleState({ cameraOk, detector, faces, prev }) {
  if (!cameraOk) return 'no_camera'
  if (detector === 'failed') return 'detector_unavailable'
  const front = detector === 'ready' ? frontFace(faces) : null
  if (!front || !(front.area > 0)) return 'no_face'
  if (!(front.score >= OCCLUDED_SCORE)) return 'occluded'
  const limit = FRONT_ESTABLISHED.has(prev) ? QUEUE_EXIT_RATIO : QUEUE_AREA_RATIO
  if (faces.some(f => f !== front && !(f?.area <= front.area * limit))) return 'crowded'
  return front.centered === true ? 'ready' : 'off_center'
}

// --- Fast path -------------------------------------------------------------------------------

// One sample this often while a face is ready (~15 per second). A blink is fully closed for only
// about 100 ms; at 125 ms between samples the peak was missed (read 0.46 on a real blink).
export const FAST_SAMPLE_MS = 66
export const FAST_WINDOW_MS = 2000     // the verdict looks at the samples of the last this-many ms
export const FAST_PATH_MIN_SIMILARITY = 93    // face match needed for an instant grant
export const FAST_PATH_COOLDOWN_MS = 60000    // no fast path after a spoof frame or a failed liveness check
export const FAST_PATH_RETRY_MS = 20000       // no fast path after any scan that ended without a result
export const FAS_CROP_SCALE = 2.7      // anti-spoof crop = face box x this (the model was trained on it)
export const FAS_MIN_CROP_SCALE = 2.0  // face so close that less than this fits: no fast path
export const SAME_FACE_IOU = 0.5       // below this overlap with the previous sample it is a different face
export const FAS_LIVE_MIN = 0.90       // anti-spoof "real" score every sample must reach
export const FAS_SPOOF_MAX = 0.20      // at or below this a sample is clearly a spoof
export const FAS_MIN_FRAMES = 5
export const FAS_MIN_SPAN_MS = 800
export const BLINK_CLOSED = 0.45       // eyeBlink blendshape: both eyes at or above = closed
export const BLINK_OPEN = 0.35         // both eyes at or below = open (a smiling face reads about 0.28)
export const BLINK_MAX_MS = 800        // open -> closed -> open must complete within this
export const BLINK_MAX_POSE_DEG = 8    // head must not rotate more than this during the blink

// The region the anti-spoof model looks at: the face box scaled about its centre, slid to stay
// inside the frame. As in the model's own code the scale shrinks when the frame is too small for
// it, but only down to FAS_MIN_CROP_SCALE: below that there is too little around the face to
// judge, so there is no crop and no fast path.
// box and result: { x, y, w, h } in frame pixels.
export function fasCropRect(box, frameW, frameH, scale = FAS_CROP_SCALE) {
  const fit = Math.min(scale, frameW / box?.w, frameH / box?.h)
  if (!(fit >= FAS_MIN_CROP_SCALE && box.w > 0 && box.h > 0)) return null
  const w = box.w * fit, h = box.h * fit
  const clamp = (v, max) => Math.min(Math.max(v, 0), max)
  return {
    x: clamp(box.x + box.w / 2 - w / 2, frameW - w),
    y: clamp(box.y + box.h / 2 - h / 2, frameH - h),
    w, h,
  }
}

// Face box plus 20% padding per side, cut at the frame edge: the image sent for identification.
export function identifyCropRect(box, frameW, frameH) {
  const x = Math.max(0, box.x - box.w * 0.2)
  const y = Math.max(0, box.y - box.h * 0.2)
  return {
    x, y,
    w: Math.min(box.x + box.w * 1.2, frameW) - x,
    h: Math.min(box.y + box.h * 1.2, frameH) - y,
  }
}

// Canvas pixels (RGBA, row by row) -> the model's input: float32, planar B, G, R, values 0-255.
export function toBgrChw(rgba, size) {
  const n = size * size
  const out = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4 + 2]
    out[n + i] = rgba[i * 4 + 1]
    out[2 * n + i] = rgba[i * 4]
  }
  return out
}

export function softmax(logits) {
  const max = Math.max(...logits)
  const exps = Array.from(logits, v => Math.exp(v - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map(v => v / sum)
}

// Overlap of two { x, y, w, h } boxes, 0..1.
export function iou(a, b) {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (!(ix > 0 && iy > 0)) return 0
  const inter = ix * iy
  return inter / (a.w * a.h + b.w * b.h - inter)
}

const SAMPLE_FIELDS = ['t', 'live', 'eyeL', 'eyeR', 'yaw', 'pitch']
const validSample = s => !!s && SAMPLE_FIELDS.every(k => Number.isFinite(s[k]))
const poseNear = (a, b) =>
  Math.abs(a.yaw - b.yaw) <= BLINK_MAX_POSE_DEG && Math.abs(a.pitch - b.pitch) <= BLINK_MAX_POSE_DEG

// samples: [{ t (ms), live (0..1), eyeL, eyeR (0..1 closed), yaw, pitch (degrees) }], oldest first.
// True when both eyes go open -> closed -> open quickly with the head held steady. Tilting a
// photo can fake closed eyes, but only together with a pose change, which is rejected here.
export function blinkSeen(samples) {
  let open = null         // latest eyes-open sample
  let closedFrom = null   // the eyes-open sample that preceded the current closure
  for (const s of samples ?? []) {
    if (!validSample(s)) { open = closedFrom = null; continue }
    const bothOpen = Math.max(s.eyeL, s.eyeR) <= BLINK_OPEN
    const bothClosed = Math.min(s.eyeL, s.eyeR) >= BLINK_CLOSED
    if (bothClosed) {
      closedFrom = open && poseNear(s, open) ? open : null
      if (!closedFrom) open = null
    } else if (bothOpen) {
      if (closedFrom && s.t - closedFrom.t <= BLINK_MAX_MS && poseNear(s, closedFrom)) return true
      open = s
      closedFrom = null
    }
  }
  return false
}

// Decides whether the samples gathered while a face was 'ready' justify skipping AWS liveness.
// It can only say yes; a no simply leaves the normal AWS liveness path in place.
// `spoof` tells the caller to start the fast-path cooldown.
export function fastPathVerdict(samples) {
  const fail = (reason, spoof = false) => ({ pass: false, spoof, reason })
  if (!Array.isArray(samples)) return fail('no samples')
  if (!samples.every(validSample)) return fail('invalid sample')
  if (samples.some((s, i) => i > 0 && s.t <= samples[i - 1].t)) return fail('out of order')
  if (samples.some(s => s.live <= FAS_SPOOF_MAX)) return fail('spoof frame', true)
  if (samples.length < FAS_MIN_FRAMES) return fail('too few frames')
  if (samples[samples.length - 1].t - samples[0].t < FAS_MIN_SPAN_MS) return fail('span too short')
  if (!samples.every(s => s.live >= FAS_LIVE_MIN)) return fail('live score too low')
  if (!blinkSeen(samples)) return fail('no blink')
  return { pass: true, spoof: false, reason: 'ok' }
}
