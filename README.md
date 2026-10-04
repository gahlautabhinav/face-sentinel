# LogBook360 Face Recognition Service

Microservice handling visitor face enrollment, identification, and liveness-based kiosk access control using AWS Rekognition. Multi-tenant. Embeds as a standalone module into any visitor management system.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 3.3.2, Java 21 |
| Face AI | AWS Rekognition (ap-south-1) |
| Liveness | AWS Rekognition Face Liveness |
| Storage | AWS S3 |
| Database | PostgreSQL 15 + Flyway |
| Auth | JWT (JJWT 0.12.6) — ADMIN + KIOSK roles |
| Frontend | React 18 + Vite, MediaPipe BlazeFace + FaceLandmarker |
| On-device anti-spoof | MiniFASNetV2 + MiniFASNetV1SE via onnxruntime-web (kiosk fast path) |
| Container | Docker / Docker Compose |

---

## Architecture

```
Admin UI (React)
  └── POST /api/face/enroll-live     — enroll via liveness session
  └── GET  /api/face/enrollments     — list enrolled visitors
  └── DELETE /api/face/{visitorId}   — remove enrollment

Kiosk UI (React, WebRTC, MediaPipe)
  └── Idle: one state decides both the message and whether the countdown runs
        - no face            → waits, no countdown, no AWS session
        - face covered       → "Face not clearly visible"
        - several people     → front person scanned only when clearly closer, else "One at a time"
        - off-centre         → "Move to center"
        - low light          → hint only, scan still runs
        - camera / detector unavailable → error with Retry / "Tap to scan"
  └── Fast path (optional, VITE_KIOSK_FAST_PATH)
        - on-device anti-spoof model + blink check on the live frames
        - both say "live" AND face match ≥ 93 → Access Granted at once
        - anything less → falls through to the liveness challenge below
  └── Liveness challenge (AWS Rekognition Face Liveness)
        - server checks the liveness result, then identifies from the liveness image
        - matched        → Access Granted (green)
        - no match       → retry once, then "Not Enrolled"
        - liveness fail  → "Not a real face"
        - server/network → "Connection problem" (never a grant)
```

### Liveness and the Fast Path

AWS Rekognition `SearchFacesByImage` matches face features but **cannot detect spoofing** — a high-quality photo or video on a phone screen can match an enrolled face with >90% similarity. The reliable spoof defence is the AWS Rekognition Face Liveness challenge, and it remains the judge for every scan the fast path does not clear.

The **fast path** lets a real, enrolled person through without the challenge. While one clear, centred face is in view the kiosk samples about fifteen times a second; each sample reads one frozen video frame with:

- **MiniFASNetV2 + MiniFASNetV1SE** (anti-spoof CNNs, run in the browser with onnxruntime-web) — each scores whether the face and its surroundings look like a live capture rather than a print or a screen. One looks at a close-up (face box × 2.7), the other at a wider view (× 4.0); the lower of the two scores counts
- **MediaPipe FaceLandmarker** — eye closure and head pose, to require a blink made with the head held steady

Access is granted instantly only when every sample in the window scores live, a blink is seen, and the face match is 93 or higher. Otherwise nothing changes and the countdown leads to the AWS challenge.

Limits to know before relying on it:

- The decision is made in the browser, so the kiosk device must be trusted. `/api/face/identify` itself performs no liveness check.
- A video replay also blinks, so against replay the defence is the anti-spoof model alone. **Test it against printed photos and phone/tablet videos on your own hardware before enabling it in production.**
- After a spoof frame or a failed liveness check the fast path is off for 60 s (20 s after any other failed scan); the AWS path stays available.
- Set `VITE_KIOSK_FAST_PATH=false` to always use the AWS challenge. Its models are then not downloaded at all.
- Open `/kiosk?debug` to see, live, both anti-spoof scores, the eye and head-pose readings and why the fast path did or did not fire. Thresholds are constants at the top of `frontend/src/kioskLogic.mjs`.

### Who Decides the Identity

After the liveness challenge the kiosk makes one call, `POST /api/liveness/identify`. The server:

1. requires the liveness session to have succeeded with enough confidence (otherwise `422`)
2. identifies from the **liveness reference image**
3. only if that finds no match, considers the optional `frameImage` — a better-angle frame the kiosk captured just before the challenge — and uses it **only when Rekognition `CompareFaces` shows it is the same person who passed liveness and no other face is in it**

A frame can therefore never decide the identity on its own, and a failed or errored liveness check never leads to a grant.

### Multi-Tenant Collections

Each tenant has an isolated Rekognition collection:
```
{REKOGNITION_COLLECTION_PREFIX}-{tenantId}
# e.g. logbook360-dev-550e8400-e29b-41d4-a716-446655440000
```

### JWT Auth

All endpoints require a Bearer token:

```http
POST /api/auth/token
Content-Type: application/json

{ "clientId": "logbook360-admin", "clientSecret": "<secret>" }
```

Two roles:
- `ADMIN` — enroll, list, delete
- `KIOSK` — identify, verify, liveness

---

## API Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/token` | Public | Get JWT token |
| POST | `/api/face/enroll` | ADMIN | Enroll face from image file |
| POST | `/api/face/enroll-live` | ADMIN | Enroll from liveness session |
| GET | `/api/face/enrollments` | ADMIN | List enrollments for tenant |
| DELETE | `/api/face/{visitorId}` | ADMIN | Remove enrolled face |
| POST | `/api/face/identify` | KIOSK | Identify unknown face |
| POST | `/api/face/verify` | KIOSK | Verify specific visitor (QR flow) |
| POST | `/api/liveness/session` | ADMIN/KIOSK | Create liveness session |
| GET | `/api/liveness/session/{id}/result` | ADMIN/KIOSK | Get liveness result |
| POST | `/api/liveness/identify` | KIOSK | Identify from liveness session image |

All endpoints require `X-Tenant-Id: <uuid>` header (except `/api/auth/token`).

### Response Format

All responses use `ApiResponse<T>`:
```json
{
  "success": true,
  "data": { ... },
  "message": "..."
}
```

### Example: Identify After Liveness

```http
POST /api/liveness/identify
Authorization: Bearer <kiosk-token>
X-Tenant-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{ "sessionId": "abc-123-...", "frameImage": "<optional base64 JPEG>" }
```

`frameImage` is optional. Returns `422` when the liveness check did not pass.

Response:
```json
{
  "success": true,
  "data": {
    "matched": true,
    "visitorId": "660e8400-...",
    "visitorName": "Abhinav Gahlaut",
    "similarity": 96.5,
    "message": "Visitor identified successfully"
  }
}
```

---

## Local Development

### Prerequisites

- Java 21 + Maven 3.9+
- Docker & Docker Compose
- Node.js 18+
- AWS account — Rekognition + S3 + Face Liveness enabled in `ap-south-1`
- IAM user with `AmazonRekognitionFullAccess` + `AmazonS3FullAccess`
- Cognito Identity Pool (for frontend liveness SDK — see [DEPLOY.md](DEPLOY.md))

### Setup

1. Clone and copy env files:
   ```bash
   git clone https://github.com/gahlautabhinav/face-sentinel.git
   cd face-sentinel
   cp .env.example .env
   cp frontend/.env.example frontend/.env.local
   ```

2. Fill in `.env` (backend):
   ```env
   AWS_ACCESS_KEY_ID=<key>
   AWS_SECRET_ACCESS_KEY=<secret>
   AWS_S3_BUCKET=logbook360-face-dev
   REKOGNITION_COLLECTION_PREFIX=logbook360-dev
   JWT_SECRET=<48-char random string>
   ADMIN_CLIENT_ID=logbook360-admin
   ADMIN_CLIENT_SECRET=<secret>
   KIOSK_CLIENT_ID=logbook360-kiosk
   KIOSK_CLIENT_SECRET=<secret>
   DB_URL=jdbc:postgresql://localhost:5435/logbook360_face
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   ```

3. Fill in `frontend/.env.local`:
   ```env
   VITE_ADMIN_CLIENT_ID=logbook360-admin
   VITE_ADMIN_CLIENT_SECRET=<same as above>
   VITE_KIOSK_CLIENT_ID=logbook360-kiosk
   VITE_KIOSK_CLIENT_SECRET=<same as above>
   VITE_COGNITO_IDENTITY_POOL_ID=ap-south-1:<pool-id>
   VITE_AWS_REGION=ap-south-1
   VITE_TENANT_ID=<your-tenant-uuid>
   VITE_KIOSK_FAST_PATH=true   # false = always use the AWS liveness challenge
   ```

4. Start database:
   ```bash
   docker compose up postgres -d
   ```

5. Run backend:
   ```bash
   mvn spring-boot:run -Dspring-boot.run.profiles=local
   # Starts on http://localhost:8080
   ```

6. Run frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   # Starts on http://localhost:3000
   ```

### Run Tests

```bash
mvn test                      # backend unit tests (no AWS, no DB)
cd frontend && npm run check  # kiosk decision logic self-check (plain node)
```

---

## Database Schema

Managed by Flyway. Migrations in `src/main/resources/db/migration/`.

| Table | Purpose |
|---|---|
| `tenants` | Tenant registry |
| `visitors` | Visitor records (name, email, phone) |
| `visitor_faces` | Rekognition face ID, S3 key, confidence |
| `recognition_logs` | Audit log for all recognition events |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_URL` | Yes | — | JDBC connection string |
| `DB_USERNAME` | Yes | — | DB user |
| `DB_PASSWORD` | Yes | — | DB password |
| `AWS_REGION` | Yes | `ap-south-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | Local only | — | Omit in prod — use IAM task role |
| `AWS_SECRET_ACCESS_KEY` | Local only | — | Omit in prod — use IAM task role |
| `AWS_S3_BUCKET` | Yes | — | S3 bucket for face images |
| `REKOGNITION_COLLECTION_PREFIX` | Yes | `logbook360` | Prefix for tenant collections |
| `REKOGNITION_SIMILARITY_THRESHOLD` | No | `90.0` | Min similarity (0–100). Use 75–80 for local dev |
| `FACE_LIVENESS_ENABLED` | No | `false` | Backend liveness gate on `/api/face/identify` (kiosk handles liveness in UI, not needed here) |
| `REKOGNITION_LIVENESS_CONFIDENCE_THRESHOLD` | No | `80.0` | Min liveness confidence score |
| `JWT_SECRET` | Yes | — | HS256 key (min 32 chars) |
| `JWT_EXPIRY_HOURS` | No | `24` | Token validity |
| `ADMIN_CLIENT_ID` | Yes | — | Admin client ID |
| `ADMIN_CLIENT_SECRET` | Yes | — | Admin client secret |
| `KIOSK_CLIENT_ID` | Yes | — | Kiosk client ID |
| `KIOSK_CLIENT_SECRET` | Yes | — | Kiosk client secret |

---

## Project Structure

```
src/main/java/com/logbook360/facerec/
├── config/          # AwsConfig, SecurityConfig, properties
├── controller/      # FaceController, AuthController, LivenessController
├── domain/          # Visitor, VisitorFace, Tenant, RecognitionLog (JPA)
├── dto/             # ApiResponse, FaceIdentifyResponse, EnrollmentDto, ...
├── exception/       # FaceNotFoundException, GlobalExceptionHandler
├── repository/      # Spring Data JPA repos
├── security/        # JwtService, JwtFilter
└── service/         # FaceEnrollmentService, FaceIdentificationService,
                     # FaceVerificationService, FaceDeletionService,
                     # RekognitionService, S3Service
    └── liveness/    # LivenessProvider, NoOpLivenessProvider

frontend/src/
├── api/             # faceApi.js, authApi.js
├── components/      # AdminPage, EnrollPage, IdentifyPage, DeletePage,
│                    # KioskPage, AccessResult, RegisterPage
├── kioskLogic.mjs   # pure kiosk decisions: idle state, queue rule, fast-path verdict
├── kioskLogic.check.mjs   # its self-check (npm run check)
└── fastPath.js      # anti-spoof model + blink sampling for the fast path

frontend/public/models/   # MiniFASNetV2.onnx, MiniFASNetV1SE.onnx + NOTICE.txt (Apache-2.0)
```

---

## Implementation Status

| Phase | Feature | Status |
|---|---|---|
| 1 | Enroll / Identify / Delete REST API | **Complete** |
| 2 | Kiosk UI — MediaPipe tracking, liveness challenge, access result | **Complete** |
| 3 | JWT Auth, Admin dashboard, smart queue + detection, spoof defence | **Complete** |
| 4 | Production deploy — ECS Fargate, RDS, GitHub Actions CI/CD | Planned |

### Kiosk Features (Phases 2–3 — Complete)

- **Liveness is the judge** — the server checks the AWS Face Liveness result and identifies from the liveness image. A failed, errored or incomplete check never grants.
- **Fast path (optional)** — on-device anti-spoof model + blink; instant grant only with a match of 93 or higher, otherwise the AWS challenge. See "Liveness and the Fast Path" for its limits.
- **Better-angle frame, safely** — the frame captured before the challenge is sent with the liveness request and used only if it shows the same person who passed liveness.
- **Queue handling** — the front person is scanned when clearly closer than everyone else (other faces at most 0.4 of their face area); otherwise "One at a time".
- **Empty kiosk stays idle** — no face means no countdown and no AWS liveness session.
- **Low-light hint** — shown when average frame luminance < 30; does not block the scan.
- **Face covering detection** — countdown pauses with a warning when MediaPipe confidence < 0.65 (hand or mask in front of face).
- **Clear failures** — camera denied or unplugged shows a Retry; face detection offline offers a manual "Tap to scan"; outages read "Connection problem", not "Not a real face".
- **Not enrolled** — a real person with no match gets one retry, then a "Not Enrolled" screen.
- **Concurrent scan guard** — one scan at a time; a late answer for an abandoned scan is ignored.
- **Camera exclusivity** — camera stream released before `FaceLivenessDetector` mounts, preventing WebRTC conflicts on repeated scans.

---

## Security Notes

- `.env` files are gitignored — never commit credentials
- AWS credentials use `StaticCredentialsProvider` locally via `@Value`; production uses IAM task role (`DefaultCredentialsProvider`)
- `spring-dotenv` only injects into Spring `Environment`, not `System.getenv()` — AWS SDK bypasses it. `AwsConfig.java` reads via `@Value` and constructs `StaticCredentialsProvider` explicitly. **Never revert this to plain `DefaultCredentialsProvider`.**
- Similarity threshold defaults to 90.0 in prod; use 75.0–80.0 in dev for easier testing
- Rekognition `SearchFacesByImage` cannot detect spoofing — the AWS liveness challenge is the reliable spoof defence. The kiosk fast path skips it on the strength of a browser-side model and must be validated on your hardware first; `VITE_KIOSK_FAST_PATH=false` turns it off
- `POST /api/face/identify` performs no liveness check; anything that calls it directly must be a trusted device
- The IAM policy needs `rekognition:CompareFaces` (used to bind the kiosk frame to the liveness result)
- The anti-spoof models in `frontend/public/models/` are from Silent-Face-Anti-Spoofing (Minivision), Apache License 2.0 — see `NOTICE.txt` beside them

---

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — How the system works end to end: pipeline, models, and the deep-learning ideas behind them
- [INTEGRATION.md](INTEGRATION.md) — How to integrate this module into your existing application
- [DEPLOY.md](DEPLOY.md) — Production deployment guide (ECS Fargate, RDS, GitHub Actions)
