// Self-check for kioskLogic.mjs. Run: npm run check  (or: node src/kioskLogic.check.mjs)
import assert from 'node:assert/strict'
import {
  idleState, frontFace, blinkSeen, fastPathVerdict, fasCropRect, identifyCropRect, toBgrChw, softmax, iou,
} from './kioskLogic.mjs'

// --- idleState -------------------------------------------------------------------------------

const face = (area, over = {}) => ({ area, score: 0.9, centered: true, ...over })
const idle = (faces, over = {}) => idleState({ cameraOk: true, detector: 'ready', faces, ...over })

assert.equal(idle([face(100)]), 'ready')
assert.equal(idle([]), 'no_face', 'no face must never be ready (empty kiosk must not scan)')
assert.equal(idle(undefined), 'no_face')
assert.equal(idle([face(0)]), 'no_face')
assert.equal(idle([face(NaN)]), 'no_face')

// camera and detector problems outrank everything
assert.equal(idle([face(100)], { cameraOk: false }), 'no_camera')
assert.equal(idle([face(100)], { cameraOk: false, detector: 'failed' }), 'no_camera')
assert.equal(idle([face(100)], { detector: 'failed' }), 'detector_unavailable')
assert.equal(idle([face(100)], { detector: 'loading' }), 'no_face')

assert.equal(idle([face(100, { score: 0.5 })]), 'occluded')
assert.equal(idle([face(100, { score: undefined })]), 'occluded', 'missing score fails closed')
assert.equal(idle([face(100, { centered: false })]), 'off_center')
assert.equal(idle([face(100, { centered: undefined })]), 'off_center')

// queue: the front person must be clearly closer than everyone else
assert.equal(idle([face(100), face(30)]), 'ready')
assert.equal(idle([face(100), face(40)]), 'ready')
assert.equal(idle([face(100), face(45)]), 'crowded')
assert.equal(idle([face(100), face(100)]), 'crowded')
assert.equal(idle([face(30), face(100), face(20)]), 'ready', 'front face need not be first')
assert.equal(idle([face(100), face(NaN)]), 'crowded', 'unknown second face fails closed')
// the front face decides occlusion and centring, not the people behind
assert.equal(idle([face(100), face(20, { score: 0.1, centered: false })]), 'ready')

// hysteresis: once a front person is established, tolerate up to 0.55
assert.equal(idle([face(100), face(50)], { prev: 'ready' }), 'ready')
assert.equal(idle([face(100), face(50)], { prev: 'off_center' }), 'ready')
assert.equal(idle([face(100), face(60)], { prev: 'ready' }), 'crowded')
assert.equal(idle([face(100), face(50)], { prev: 'crowded' }), 'crowded')
assert.equal(idle([face(100), face(50)], { prev: 'no_face' }), 'crowded')
assert.equal(idle([face(100), face(40)], { prev: 'crowded' }), 'ready')

// a broken entry in the list must not crash the frame loop, and must not read as "alone"
assert.equal(idle([face(100), null]), 'crowded')
assert.equal(idle([null]), 'no_face')
assert.equal(idle([null, face(100)]), 'crowded')

assert.equal(frontFace([face(10), face(50), face(20)]).area, 50)
assert.equal(frontFace([]), null)

// --- blinkSeen -------------------------------------------------------------------------------

// builds samples 125 ms apart from a list of eye-closed values (same for both eyes)
const seq = (eyes, over = () => ({})) =>
  eyes.map((e, i) => ({ t: i * 125, live: 0.97, eyeL: e, eyeR: e, yaw: 0, pitch: 0, ...over(i) }))

assert.equal(blinkSeen(seq([0.1, 0.1, 0.8, 0.1, 0.1])), true)
assert.equal(blinkSeen(seq([0.1, 0.3, 0.8, 0.9, 0.3, 0.1])), true, 'partial frames in between are fine')
assert.equal(blinkSeen([]), false)
assert.equal(blinkSeen(undefined), false)
assert.equal(blinkSeen(seq([0.1, 0.1, 0.1, 0.1, 0.1])), false, 'eyes always open')
assert.equal(blinkSeen(seq([0.8, 0.8, 0.8, 0.8, 0.8])), false, 'eyes always closed')
assert.equal(blinkSeen(seq([0.8, 0.8, 0.1, 0.1, 0.1])), false, 'must start from open eyes')
assert.equal(blinkSeen(seq([0.1, 0.8, 0.8, 0.8, 0.8])), false, 'must reopen')

assert.equal(blinkSeen(seq([0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])), false,
  'closed first frame then open is not a blink')
assert.equal(blinkSeen(seq([0.1, 0.3, 0.3, 0.3, 0.1])), false, 'half-shut eyes never count as closed')

// one eye only (a wink, or half the face covered) is not a blink
assert.equal(blinkSeen(seq([0.1, 0.1, 0.8, 0.1, 0.1], i => (i === 2 ? { eyeR: 0.1 } : {}))), false)

// tilting a photo fakes closed eyes together with a pose change: rejected
assert.equal(blinkSeen(seq([0.1, 0.1, 0.8, 0.1, 0.1], i => (i === 2 ? { pitch: 20 } : {}))), false,
  'closure during rotation, even if the head returns')
assert.equal(blinkSeen(seq([0.1, 0.1, 0.8, 0.1, 0.1], i => (i >= 3 ? { yaw: 15 } : {}))), false,
  'head ends up rotated')
assert.equal(blinkSeen(seq([0.1, 0.1, 0.8, 0.1, 0.1], i => (i === 2 ? { pitch: 5 } : {}))), true,
  'small natural movement is fine')

// too slow to be a blink (eyes shut for over a second)
assert.equal(blinkSeen(seq([0.1, ...Array(9).fill(0.8), 0.1])), false)
// a later, proper blink still counts after a rejected one
assert.equal(blinkSeen(seq([0.1, ...Array(9).fill(0.8), 0.1, 0.1, 0.8, 0.1])), true)
// a broken sample in the middle of a blink voids it
assert.equal(blinkSeen(seq([0.1, 0.1, 0.8, 0.1], i => (i === 2 ? { yaw: NaN } : {}))), false)

// --- fastPathVerdict -------------------------------------------------------------------------

const good = seq([0.1, 0.1, 0.1, 0.8, 0.1, 0.1, 0.1, 0.1])   // 8 samples, 875 ms, one blink
const verdict = s => fastPathVerdict(s)

assert.deepEqual(verdict(good), { pass: true, spoof: false, reason: 'ok' })

// fail-open traps
assert.equal(verdict([]).pass, false, 'no samples must not pass')
assert.equal(verdict(undefined).pass, false)
assert.equal(verdict(null).pass, false)
assert.equal(verdict(good.slice(0, 4)).pass, false, 'too few frames')
assert.equal(verdict(seq([0.1, 0.1, 0.8, 0.1, 0.1, 0.1, 0.1])).pass, false, '7 samples = 750 ms, under the span')
assert.equal(verdict(good.map(s => ({ ...s, t: s.t / 2 }))).pass, false, 'enough frames, span too short')

const withLive = (i, live) => good.map((s, j) => (j === i ? { ...s, live } : s))
assert.equal(verdict(withLive(5, 0.89)).pass, false, 'one frame under the minimum fails')
assert.equal(verdict(withLive(5, 0.9)).pass, true, 'exactly the minimum passes')
assert.equal(verdict(withLive(5, NaN)).pass, false, 'NaN score fails')
assert.equal(verdict(withLive(5, undefined)).pass, false)
assert.equal(verdict(withLive(5, '0.99')).pass, false, 'string score fails')
assert.equal(verdict(withLive(5, Infinity)).pass, false)
assert.equal(verdict(good.map((s, j) => (j === 2 ? null : s))).pass, false, 'null sample fails')
assert.equal(verdict(good.map((s, j) => (j === 2 ? { ...s, yaw: undefined } : s))).pass, false)
assert.equal(verdict([...good].reverse()).pass, false, 'timestamps out of order')
assert.equal(verdict(good.map((s, j) => (j === 3 ? { ...s, t: good[2].t } : s))).pass, false,
  'duplicate timestamp')

// spoof frame: no pass, and the caller is told to start the cooldown
assert.deepEqual(verdict(withLive(5, 0.1)), { pass: false, spoof: true, reason: 'spoof frame' })
assert.equal(verdict(withLive(5, 0.5)).spoof, false, 'a doubtful frame is not a spoof verdict')

// high scores without a blink are not enough (a still photo that fools the model)
assert.equal(verdict(seq([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])).reason, 'no blink')
// a blink without good scores is not enough either
assert.equal(verdict(good.map(s => ({ ...s, live: 0.6 }))).reason, 'live score too low')

// --- fast-path geometry and model input ------------------------------------------------------

// centred 100px face in a 1280x720 frame: 270px crop around it
assert.deepEqual(fasCropRect({ x: 590, y: 310, w: 100, h: 100 }, 1280, 720), { x: 505, y: 225, w: 270, h: 270 })
// near the top edge: same size, slid down to stay inside
assert.deepEqual(fasCropRect({ x: 590, y: 20, w: 100, h: 100 }, 1280, 720), { x: 505, y: 0, w: 270, h: 270 })
// near the bottom-right corner: slid up and left
assert.deepEqual(fasCropRect({ x: 1170, y: 610, w: 100, h: 100 }, 1280, 720), { x: 1010, y: 450, w: 270, h: 270 })
// a closer face: the scale shrinks to what the frame allows (here 720 / 300 = 2.4)
assert.deepEqual(fasCropRect({ x: 400, y: 100, w: 300, h: 300 }, 1280, 720), { x: 190, y: 0, w: 720, h: 720 })
// closer still: under the 2.0 floor there is too little around the face, so no crop, no fast path
assert.deepEqual(fasCropRect({ x: 400, y: 100, w: 360, h: 360 }, 1280, 720), { x: 220, y: 0, w: 720, h: 720 }, 'exactly 2.0 fits')
assert.equal(fasCropRect({ x: 400, y: 100, w: 361, h: 361 }, 1280, 720), null, 'just under 2.0')
assert.equal(fasCropRect({ x: 0, y: 0, w: 700, h: 700 }, 1280, 720), null)
assert.equal(fasCropRect(null, 1280, 720), null)
assert.equal(fasCropRect({ x: 0, y: 0, w: NaN, h: 100 }, 1280, 720), null)
assert.equal(fasCropRect({ x: 0, y: 0, w: 0, h: 0 }, 1280, 720), null)

// identification image: face box plus 20% each side, cut at the frame edge
assert.deepEqual(identifyCropRect({ x: 500, y: 300, w: 100, h: 100 }, 1280, 720), { x: 480, y: 280, w: 140, h: 140 })
assert.deepEqual(identifyCropRect({ x: 10, y: 5, w: 100, h: 100 }, 1280, 720), { x: 0, y: 0, w: 130, h: 125 })
assert.deepEqual(identifyCropRect({ x: 1200, y: 640, w: 100, h: 100 }, 1280, 720), { x: 1180, y: 620, w: 100, h: 100 })

// 2x2 image, pixels (R,G,B): (1,2,3) (4,5,6) (7,8,9) (10,11,12) -> planes B, G, R
assert.deepEqual(
  Array.from(toBgrChw([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255], 2)),
  [3, 6, 9, 12, 2, 5, 8, 11, 1, 4, 7, 10])

const sm = softmax([1, 3, 1])
assert.ok(Math.abs(sm.reduce((a, b) => a + b) - 1) < 1e-9)
assert.ok(sm[1] > 0.78 && sm[1] < 0.79 && sm[0] === sm[2])
assert.ok(softmax([1000, 1001, 999]).every(Number.isFinite), 'large logits must not overflow')

const b = (x, y, w, h) => ({ x, y, w, h })
assert.equal(iou(b(0, 0, 10, 10), b(0, 0, 10, 10)), 1)
assert.equal(iou(b(0, 0, 10, 10), b(20, 20, 10, 10)), 0)
assert.equal(iou(b(0, 0, 10, 10), b(10, 0, 10, 10)), 0, 'touching boxes do not overlap')
assert.ok(Math.abs(iou(b(0, 0, 10, 10), b(5, 0, 10, 10)) - 1 / 3) < 1e-9)

console.log('kioskLogic: all checks passed')
