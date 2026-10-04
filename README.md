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
| Frontend | React 18 + Vite, MediaPipe BlazeFace |
| Container | Docker / Docker Compose |

---

## Architecture

```
Admin UI (React)
  └── POST /api/face/enroll-live     — enroll via liveness session
  └── GET  /api/face/enrollments     — list enrolled visitors
  └── DELETE /api/face/{visitorId}   — remove enrollment

Kiosk UI (React, WebRTC, MediaPipe)
  └── Frame-by-frame detection:
        - Largest face selected (queue ordering — closest person first)
        - Low-light warning if avg luminance < 30
        - Face covering detection via MediaPipe confidence score
        - Multiple-person detection — countdown pauses, closest scanned first
  └── Always → liveness challenge (AWS Rekognition Face Liveness)
        - Proves real person (defeats photos, video playback, phone screens)
        - After challenge passes: dual-image identify
            1. Pre-captured frame (captured when face centered + stable)
            2. Liveness session image (fallback)
        - matched      → Access Granted (green)
        - no match     → "Face not recognized — try again" (retry prompt)
        - liveness fail → "Not a real face" (error)
```

### Why Always Liveness

AWS Rekognition `SearchFacesByImage` matches face features but **cannot detect spoofing** — a high-quality photo or video on a phone screen can match an enrolled face with >90% similarity. The only reliable spoof defence is AWS Rekognition Face Liveness Challenge (3D depth + randomised challenge). Every scan goes through liveness regardless of image quality.

### Dual-Image Identify

After liveness passes, two identify attempts run:
1. **Pre-captured frame** — captured when face was confirmed centered and stable, best angle for matching
2. **Liveness session image** — captured during the oval challenge (may be off-angle), used as fallback

Best similarity from either attempt wins. This prevents enrolled people from being rejected due to the liveness challenge's close-up oval angle.

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

{ "sessionId": "abc-123-..." }
```

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
   git clone https://github.com/gahlautabhinav/lb-face-recog.git
   cd lb-face-recog
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
mvn test
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
└── components/      # AdminPage, EnrollPage, IdentifyPage, DeletePage,
                     # KioskPage, AccessResult, RegisterPage
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

- **Always-liveness** — every scan goes through AWS Face Liveness Challenge. No bypass. Defeats photos, videos, and phone screens.
- **Dual-image identify** — pre-captured stable frame (primary) + liveness session image (fallback). Best match wins. Handles angle variation from the oval challenge.
- **Queue ordering** — largest detected face (closest to camera) scanned first. Countdown pauses when multiple people are in frame.
- **Low-light warning** — warns user when average frame luminance < 30.
- **Face covering detection** — countdown pauses with warning when MediaPipe confidence < 0.65 (hand or mask in front of face).
- **Concurrent scan guard** — prevents duplicate liveness sessions from async race conditions.
- **Camera exclusivity** — camera stream released before `FaceLivenessDetector` mounts, preventing WebRTC conflicts on repeated scans.
- **Retry on no-match** — liveness pass + no identify match → "Face not recognized — try again" rather than a misleading "Not Enrolled" message.

---

## Security Notes

- `.env` files are gitignored — never commit credentials
- AWS credentials use `StaticCredentialsProvider` locally via `@Value`; production uses IAM task role (`DefaultCredentialsProvider`)
- `spring-dotenv` only injects into Spring `Environment`, not `System.getenv()` — AWS SDK bypasses it. `AwsConfig.java` reads via `@Value` and constructs `StaticCredentialsProvider` explicitly. **Never revert this to plain `DefaultCredentialsProvider`.**
- Similarity threshold defaults to 90.0 in prod; use 75.0–80.0 in dev for easier testing
- Rekognition `SearchFacesByImage` cannot detect spoofing — the liveness challenge in the kiosk UI is the only reliable spoof defence

---

## See Also

- [INTEGRATION.md](INTEGRATION.md) — How to integrate this module into your existing application
- [DEPLOY.md](DEPLOY.md) — Production deployment guide (ECS Fargate, RDS, GitHub Actions)
