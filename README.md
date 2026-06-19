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
        - Largest face selected (queue ordering)
        - Low-light warning if avg luminance < 30
        - Face covering detection via MediaPipe confidence score
        - Phone/screen detection via R/B colour ratio
  └── Decision tree:
        score < 0.65  → pause, show "Remove face covering"
        rbRatio ≤ 1.20 → liveness challenge (phone screen detected)
        else → POST /api/face/identify (fast path)
                 matched   → Access Granted (green)
                 no match  → liveness challenge
                               passes + matched → Access Granted
                               passes + no match → Not Enrolled (amber)
                               fails → Not a real face (error)
```

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
| POST | `/api/liveness/identify` | KIOSK | Identify from liveness session |

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

### Example: Identify (Kiosk fast path)

```http
POST /api/face/identify
Authorization: Bearer <kiosk-token>
X-Tenant-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: multipart/form-data

image: <jpeg file>
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
   DB_URL=jdbc:postgresql://localhost:5433/logbook360_face
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
| `FACE_LIVENESS_ENABLED` | No | `false` | Enable/disable liveness check on `/api/face/identify` |
| `REKOGNITION_LIVENESS_CONFIDENCE_THRESHOLD` | No | `80.0` | Min liveness confidence |
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
| 2 | Kiosk UI — MediaPipe tracking, liveness, access result screen | **Complete** |
| 3 | JWT Auth (ADMIN/KIOSK), Admin dashboard, smart kiosk detection | **Complete** |
| 4 | Production deploy — ECS Fargate, RDS, GitHub Actions CI/CD | Planned |

### Kiosk Smart Detection (Phase 3 — Complete)

- **Queue ordering** — largest face (closest) scanned first; countdown pauses with multiple people
- **Low light detection** — warns user if scene is too dark
- **Face covering detection** — countdown pauses + warning when hand/mask detected (MediaPipe confidence < 0.65)
- **Phone screen detection** — R/B colour ratio gates phone/video/screen spoofing
- **Fallback to liveness** — fast identify miss → liveness before showing access denied
- **Not Enrolled state** — real person (liveness passed) but not in DB → amber "Not Enrolled" screen

---

## Security Notes

- `.env` files are gitignored — never commit credentials
- AWS credentials use `StaticCredentialsProvider` locally; production uses IAM task role (`DefaultCredentialsProvider`)
- `spring-dotenv` only injects into Spring `Environment`, not `System.getenv()` — AWS SDK bypasses it. `AwsConfig.java` reads via `@Value` and constructs `StaticCredentialsProvider` explicitly
- Similarity threshold defaults to 90.0 in prod; use 75.0–80.0 in dev for easier testing

---

## See Also

- [INTEGRATION.md](INTEGRATION.md) — How to integrate this module into your existing application
- [DEPLOY.md](DEPLOY.md) — Production deployment guide (ECS Fargate, RDS, GitHub Actions)
