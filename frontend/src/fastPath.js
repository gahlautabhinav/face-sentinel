// Browser side of the kiosk fast path: loads the two models and turns one frozen video frame
// into one sample for fastPathVerdict (kioskLogic.mjs).
//
//   anti-spoof: MiniFASNetV2 + MiniFASNetV1SE (Silent-Face-Anti-Spoofing, Apache-2.0) via
//               onnxruntime-web. Each scores how much the face and its surroundings look like a
//               live capture rather than a print or a screen; the lower score counts.
//   blink:      MediaPipe FaceLandmarker blendshapes, plus head pose from its transform matrix.
//
// Loaded only when the fast path is enabled, so with the flag off none of this is fetched.
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { fasCropRect, toBgrChw, softmax } from './kioskLogic.mjs'

// The anti-spoof project ships its model as a pair, each trained on a different amount of
// surroundings: a close-up view and a wide view (more background, more chance to catch the
// edge of a phone or a print). Both must call the face real.
const ANTI_SPOOF_MODELS = [
  { name: 'near', file: 'MiniFASNetV2.onnx', scale: 2.7 },
  { name: 'wide', file: 'MiniFASNetV1SE.onnx', scale: 4.0 },
]
const LANDMARKER_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const REAL_CLASS = 1            // model output index for "real face"; the others are spoof types
const LANDMARK_CROP_SCALE = 1.8 // landmarker sees the face box x this, so it cannot pick another face
const DEG = 180 / Math.PI

let antiSpoofPromise = null

// Resolves to { score(canvas, box) }. One session for the life of the page.
export function loadAntiSpoof() {
  antiSpoofPromise ??= (async () => {
    const ort = await import('onnxruntime-web/wasm')
    ort.env.wasm.numThreads = 1   // no worker, no cross-origin isolation needed
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`
    const models = await Promise.all(ANTI_SPOOF_MODELS.map(async ({ name, file, scale }) => {
      const session = await ort.InferenceSession.create(
        `${import.meta.env.BASE_URL}models/${file}`, { executionProviders: ['wasm'] })
      const dims = session.inputMetadata?.[0]?.shape
      const size = Number.isInteger(dims?.[2]) ? dims[2] : 80
      const scratch = document.createElement('canvas')
      scratch.width = scratch.height = size
      return { name, scale, session, size, ctx: scratch.getContext('2d', { willReadFrequently: true }) }
    }))

    // frame: canvas holding one video frame. box: face { x, y, w, h } in its pixels.
    // Returns { live, near, wide }: each model's "real" probability 0..1 and `live`, the lower of
    // the two. Returns null when too little of the surroundings fits in the frame.
    async function score(frame, box) {
      const result = {}
      for (const m of models) {
        const crop = fasCropRect(box, frame.width, frame.height, m.scale)
        if (!crop) return null
        m.ctx.drawImage(frame, crop.x, crop.y, crop.w, crop.h, 0, 0, m.size, m.size)
        const input = toBgrChw(m.ctx.getImageData(0, 0, m.size, m.size).data, m.size)
        const out = await m.session.run(
          { [m.session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, m.size, m.size]) })
        result[m.name] = softmax(out[m.session.outputNames[0]].data)[REAL_CLASS]
      }
      result.live = Math.min(result.near, result.wide)
      return result
    }
    return { score }
  })()
  antiSpoofPromise.catch(() => { antiSpoofPromise = null })   // allow a later retry
  return antiSpoofPromise
}

// vision: the FilesetResolver result the kiosk already has for its face detector.
// The kiosk rebuilds the landmarker after every AWS liveness scan, so the model file is fetched
// once and kept; a rebuild then costs no network round trip.
let landmarkerModel = null
async function landmarkerModelBytes() {
  if (!landmarkerModel) {
    const res = await fetch(LANDMARKER_MODEL)
    if (!res.ok) throw new Error(`face landmarker model: HTTP ${res.status}`)
    landmarkerModel = new Uint8Array(await res.arrayBuffer())
  }
  return landmarkerModel
}

export async function createLandmarker(vision) {
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetBuffer: await landmarkerModelBytes(), delegate: 'GPU' },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  })
  // The first detect compiles shaders and can block for a second or more; do it now, while
  // nobody is being scanned, instead of in the middle of the first visitor's countdown.
  faceCanvas.width = faceCanvas.height = 64
  landmarker.detect(faceCanvas)
  return landmarker
}

const faceCanvas = document.createElement('canvas')

// Eye closure (0 open .. 1 closed) and head pose for the face inside `box`, read from a crop of
// `frame` around that box. Returns null when no face is found there.
function readFace(landmarker, frame, box) {
  const w = Math.min(box.w * LANDMARK_CROP_SCALE, frame.width)
  const h = Math.min(box.h * LANDMARK_CROP_SCALE, frame.height)
  const x = Math.min(Math.max(box.x + box.w / 2 - w / 2, 0), frame.width - w)
  const y = Math.min(Math.max(box.y + box.h / 2 - h / 2, 0), frame.height - h)
  faceCanvas.width = Math.round(w)
  faceCanvas.height = Math.round(h)
  faceCanvas.getContext('2d').drawImage(frame, x, y, w, h, 0, 0, faceCanvas.width, faceCanvas.height)

  const res = landmarker.detect(faceCanvas)
  const shapes = res.faceBlendshapes?.[0]?.categories
  const m = res.facialTransformationMatrixes?.[0]?.data
  if (!shapes || !m) return null
  const shape = name => shapes.find(c => c.categoryName === name)?.score
  return {
    eyeL: shape('eyeBlinkLeft'),
    eyeR: shape('eyeBlinkRight'),
    // column-major 4x4; only changes in these angles matter, not their absolute convention
    yaw: Math.atan2(m[8], m[10]) * DEG,
    pitch: Math.asin(Math.max(-1, Math.min(1, -m[9]))) * DEG,
  }
}

// One sample for fastPathVerdict, all read from the same frozen frame and the same face box, so
// the blink cannot come from a different face than the one scored and later identified.
// Returns null when this frame cannot be used (crop does not fit, no landmarks).
export async function takeSample({ antiSpoof, landmarker, frame, box, t }) {
  const face = readFace(landmarker, frame, box)
  if (!face) return null
  const spoof = await antiSpoof.score(frame, box)
  if (!spoof) return null
  return { t, live: spoof.live, liveNear: spoof.near, liveWide: spoof.wide, ...face }
}
