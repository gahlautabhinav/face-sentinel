// Self-check for kioskLogic.mjs. Run: npm run check  (or: node src/kioskLogic.check.mjs)
import assert from 'node:assert/strict'
import { idleState, frontFace, blinkSeen, fastPathVerdict } from './kioskLogic.mjs'

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

console.log('kioskLogic: all checks passed')
