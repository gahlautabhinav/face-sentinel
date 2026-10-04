# How the Face Recognition System Works

A plain-language walk through the whole system: what happens when someone enrolls, what happens when they stand at the kiosk, which models are involved, and which deep-learning ideas each one uses.

## 1. The problem in one paragraph

A visitor is registered once with a picture of their face. Later they walk up to a kiosk and should be let in without a card or a code. Two questions have to be answered every time: **who is this?** (face recognition) and **is this a real person standing here, or a photo or video of one?** (liveness, also called presentation-attack detection). Recognition alone is not enough: a recognition model happily matches a phone showing someone's picture.

## 2. Big picture

```
                      BROWSER (kiosk)                                  SERVER (Spring Boot)             AWS
┌──────────────────────────────────────────────────────┐      ┌───────────────────────────┐   ┌─────────────────────┐
│ camera frames                                        │      │                           │   │                     │
│   │                                                  │      │  FaceController           │   │  Rekognition        │
│   ├─► BlazeFace ──► where are the faces?             │      │  LivenessController       │   │   - face collection │
│   │        │                                         │      │        │                  │   │     (one per tenant)│
│   │        ▼                                         │      │  services ───────────────────►│   - search / compare│
│   │   idle gate (rules, no ML)                       │      │        │                  │   │   - Face Liveness   │
│   │        │ one clear, centred face                 │      │        ▼                  │   │                     │
│   ├─► MiniFASNet x2 ──► looks like a live capture?   │      │  PostgreSQL               │   │  S3 (enrollment     │
│   ├─► FaceLandmarker ──► did the eyes blink?         │      │  visitors, faces, logs    │   │      images)        │
│   │        │                                         │      │                           │   │                     │
│   │   fast path verdict (rules) ── yes ──► identify ─┼─────►│                           │   │                     │
│   │        │ no / not sure                           │      │                           │   │                     │
│   └─► AWS Face Liveness challenge ───────────────────┼─────►│  liveness result decides  │   │                     │
└──────────────────────────────────────────────────────┘      └───────────────────────────┘   └─────────────────────┘
```

Three of the models run **inside the browser** on the kiosk machine (fast, free, private). Recognition itself and the strong liveness check run **in AWS** through the server.

## 3. Enrollment: teaching the system a face

1. An admin submits a face image (or the visitor does a liveness check on the registration page and its image is used).
2. The server asks Rekognition `DetectFaces` and rejects the image unless it holds **exactly one face** detected with **at least 90% confidence**.
3. The image is stored in S3.
4. Rekognition `IndexFaces` turns the face into a **feature vector** (an "embedding") and stores that vector in the tenant's **collection**. It returns a face ID.
5. The database keeps the link: visitor ↔ Rekognition face ID ↔ S3 key.

Each tenant (customer) has its own collection, named `{prefix}-{tenantId}`, so one tenant's faces can never match another's.

## 4. At the kiosk: the pipeline, step by step

### Step 1 — Find faces (BlazeFace, in the browser, every frame)

MediaPipe's BlazeFace detector reports a box and a confidence score for every face in the camera frame.

### Step 2 — Idle gate (plain rules, no ML)

One function (`idleState` in `frontend/src/kioskLogic.mjs`) turns the detections into a single state. Only `ready` lets anything proceed.

| State | Condition |
|---|---|
| no face | nobody in view; nothing starts, nothing is sent to AWS |
| occluded | front face detected with confidence below 0.65 (mask, hand) |
| crowded | another face is more than 0.4 of the front face's area (people side by side) |
| off-centre | front face not near the middle of the screen |
| ready | one clear, centred face, clearly in front of anyone else |

A 3-second countdown runs while the state is `ready`. When it ends, the AWS liveness challenge starts (step 4). The fast path (step 3) races that countdown.

### Step 3 — Fast path (two small neural networks, in the browser)

About 15 times a second the kiosk freezes one video frame and reads three things from that same frame:

- **Anti-spoof score, close-up view** — MiniFASNetV2 on the face box enlarged 2.7×.
- **Anti-spoof score, wide view** — MiniFASNetV1SE on the face box enlarged 4.0×.
- **Eye closure and head pose** — MediaPipe FaceLandmarker.

The lower of the two anti-spoof scores is the "live" score. Then a rule decides (`fastPathVerdict`):

- at least 5 samples spanning at least 0.8 s, all within the last 2 s
- **every** sample's live score ≥ 0.90
- a **blink**: both eyes open → closed → open within 0.8 s, with the head turned no more than 8° meanwhile (tilting a printed photo makes the eyes look shut, but only together with a pose change)

If all hold, that same frozen frame is sent to the server for identification, and access is granted at once **only if the match is 93% or higher**. Any sample scoring ≤ 0.20 is treated as a clear spoof and switches the fast path off for 60 seconds.

If the fast path does not pass, nothing is denied. The countdown simply finishes and step 4 runs.

### Step 4 — AWS Face Liveness challenge (in AWS)

The visitor follows an on-screen oval. A short video is streamed to AWS, which returns a **confidence score (0–100)** that a real person was present, plus a clean **reference image** of the face.

### Step 5 — Who is it? (Rekognition, in AWS, via the server)

The server, not the browser, makes the decision:

1. The liveness session must have succeeded with confidence ≥ 80, otherwise the answer is "not a real face" (HTTP 422).
2. The reference image is searched in the tenant's collection (`SearchFacesByImage`). Matches at or above the similarity threshold (90% by default) come back best first; the first one that still has a database record is the visitor.
3. Only if that finds nobody, the server may use a better-angle frame the kiosk captured before the challenge, and only when `CompareFaces` confirms it shows **the same person who passed liveness and nobody else**.

Every attempt is written to the `recognition_logs` table.

## 5. The models

| Model | Runs | Job | Input → output |
|---|---|---|---|
| **BlazeFace** (MediaPipe face detector, short range) | browser, GPU | find faces | frame → boxes + confidence |
| **MiniFASNetV2** | browser, WebAssembly | anti-spoof, close-up | 80×80 crop → 3 scores, index 1 = real |
| **MiniFASNetV1SE** | browser, WebAssembly | anti-spoof, wide view | 80×80 crop → 3 scores, index 1 = real |
| **MediaPipe FaceLandmarker** | browser, GPU | eye closure, head pose | face crop → 478 3-D landmarks, 52 expression scores, pose matrix |
| **AWS Rekognition** face model | AWS | recognition | face image → feature vector; search and compare by similarity |
| **AWS Rekognition Face Liveness** | AWS | strong liveness | challenge video → confidence + reference image |

The two MiniFASNet files (about 1.7 MB each) come from the open-source Silent-Face-Anti-Spoofing project (Apache-2.0) and are run with onnxruntime-web. The AWS models are proprietary; their internals are not published.

## 6. The deep-learning ideas behind each one

**Convolutional neural networks (CNNs).** All of these are CNNs: stacks of small learned filters that turn pixels into progressively more abstract features (edges → textures → parts → "a face").

**Lightweight convolutions.** BlazeFace and MiniFASNet are built for phones and browsers. They use *depthwise separable convolutions*: instead of one expensive filter over all channels, a cheap per-channel filter followed by a 1×1 mixing step. Same idea as MobileNet, far fewer multiplications.

**Single-shot detection (BlazeFace).** The detector looks at the image once and, for a fixed grid of candidate boxes ("anchors"), predicts "is there a face here?" plus small corrections to the box. Overlapping answers are merged. This is the SSD family of detectors, tuned for faces.

**Landmark regression (FaceLandmarker).** Instead of a class, the network outputs coordinates: 478 points on the face in 3-D. A second small network converts those points into 52 *blendshape* scores such as "left eye closed". We use two of them, and the pose matrix, to detect a blink with a steady head.

**Classification with softmax (MiniFASNet).** The anti-spoof networks output three raw scores; softmax turns them into probabilities that add up to 1. We read the probability of the "real" class.

**Squeeze-and-Excitation (the "SE" in V1SE).** A small side branch that looks at each feature channel's overall activity and learns to turn useful channels up and unhelpful ones down: a simple form of attention.

**Learning what a recapture looks like.** A photo of a screen or a print differs from a live capture in fine detail: moiré patterns, missing high-frequency texture, glare, flatness. Silent-Face trained its networks with an extra task of predicting the image's **Fourier spectrum**, which pushes them to notice exactly those frequency differences. The two networks see different amounts of background (2.7× and 4×) because the surroundings (a phone's edge, a paper's border) are a strong clue.

**Face embeddings and metric learning (Rekognition).** A recognition network is trained so that two pictures of the same person map to nearby points in a high-dimensional space and different people map far apart. Enrollment stores the point; identification finds the nearest stored point and reports how close it is as a **similarity** score. This is the same idea as the published FaceNet and ArcFace methods.

**Thresholds trade two kinds of error.** Every score is compared with a threshold. Raise it and impostors get in less often (lower false-accept rate) but genuine users are turned away more often (higher false-reject rate). That is why the instant path demands 93 while the normal path accepts 90, and why the thresholds are constants at the top of `kioskLogic.mjs` to be tuned on real hardware.

**Why two liveness methods.** The browser models are *passive*: they judge ordinary frames, cost nothing and take about a second, but can be fooled by a good enough replay. The AWS check is *active*: it makes the person respond to a challenge and analyses the result server-side, which is far harder to fake but takes several seconds. The system uses the cheap one to speed up the easy cases and keeps the strong one as the judge for everything else.

## 7. What is not machine learning

A lot of the reliability comes from ordinary logic around the models:

- the idle gate and its hysteresis (so the screen does not flicker between states)
- requiring the anti-spoof score, the blink and the identified image to come from **one frozen frame and one face box**
- cooldowns after a suspicious frame or a failed scan
- ignoring a late server answer for a scan the kiosk already abandoned
- the server refusing to identify anyone unless liveness passed

These rules live in `frontend/src/kioskLogic.mjs` and are checked by `npm run check`.

## 8. Limits, stated plainly

- The fast path is decided in the browser, so the kiosk device must be trusted.
- A video replay also blinks. Against replay the fast path relies on the two anti-spoof networks; they were trained by a third party on other cameras, so they must be tried against printed photos and phone or tablet videos on the actual kiosk hardware. `VITE_KIOSK_FAST_PATH=false` turns the fast path off.
- `POST /api/face/identify` does no liveness check by itself.
- Rekognition's and Face Liveness's architectures are not public; the descriptions above are of the general technique, not AWS's exact design.

## 9. Where things are in the code

| What | Where |
|---|---|
| Kiosk screen and flow | `frontend/src/components/KioskPage.jsx` |
| Idle gate, queue rule, fast-path verdict, thresholds | `frontend/src/kioskLogic.mjs` |
| Anti-spoof and blink sampling | `frontend/src/fastPath.js` |
| Anti-spoof model files | `frontend/public/models/` |
| Enrollment | `src/main/java/.../service/FaceEnrollmentService.java` |
| Identification | `src/main/java/.../service/FaceIdentificationService.java` |
| Liveness result and frame binding | `src/main/java/.../service/LivenessService.java` |
| All Rekognition calls | `src/main/java/.../service/RekognitionService.java` |

Open `/kiosk?debug` to watch the fast path's numbers live: both anti-spoof scores, eye values, head pose and the verdict.
