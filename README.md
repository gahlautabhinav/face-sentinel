# LogBook360 Face Recognition Service

Microservice handling visitor face enrollment, identification, verification, and liveness detection using AWS Rekognition and S3. Designed for multi-tenant kiosk access control.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 3.3.2, Java 21 |
| Face AI | AWS Rekognition (ap-south-1) |
| Liveness | AWS Rekognition Face Liveness |
| Storage | AWS S3 |
| Database | PostgreSQL 15 + Flyway |
| Auth | JWT (JJWT 0.12.6) — ADMIN + KIOSK roles |
| Frontend | React + Vite, MediaPipe face detection |
| Container | Docker / Docker Compose |

## Architecture Overview

```
Admin UI (React)
  └── Enrollment via liveness session → POST /api/face/enroll-live
  └── Admin dashboard → GET /api/face/enrollments
  └── Delete enrollment → DELETE /api/face/{visitorId}

Kiosk UI (React, WebRTC)
  └── Face Liveness session → POST /api/liveness/session
  └── Identify from session → POST /api/liveness/identify
  └── OR: QR scan → POST /api/face/verify (legacy static flow)
  └── Match → Access Granted (green fullscreen)
  └── No match → Access Denied (red fullscreen)
  └── Auto-reset after 10s
```

### Multi-Tenant Collections

Each tenant gets an isolated Rekognition collection:
```
{REKOGNITION_COLLECTION_PREFIX}-{tenantId}
# e.g. logbook360-dev-550e8400-e29b-41d4-a716-446655440000
```

### JWT Authentication

All endpoints require a Bearer token. Obtain one:

```http
POST /api/auth/token
Content-Type: application/json

{ "clientId": "logbook360-admin", "clientSecret": "<secret>" }
```

Two roles:
- `ADMIN` — enroll, list, delete, liveness enroll
- `KIOSK` — identify, verify, liveness identify

## API Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/token` | Public | Get JWT token |
| POST | `/api/face/enroll` | ADMIN | Enroll face from image file |
| POST | `/api/face/enroll-live` | ADMIN | Enroll face from liveness session |
| GET | `/api/face/enrollments` | ADMIN | List all enrollments for tenant |
| DELETE | `/api/face/{visitorId}` | ADMIN | Remove enrolled face |
| POST | `/api/face/identify` | KIOSK | Identify unknown face (tenant-wide search) |
| POST | `/api/face/verify` | KIOSK | Verify specific visitor face (QR flow) |
| POST | `/api/liveness/session` | ADMIN/KIOSK | Create liveness session |
| GET | `/api/liveness/session/{id}/result` | ADMIN/KIOSK | Get liveness session result |
| POST | `/api/liveness/identify` | KIOSK | Identify from liveness session |

All endpoints require `X-Tenant-Id: <uuid>` header (except `/api/auth/token`).

### Example: Enroll (image upload)

```http
POST /api/face/enroll
Authorization: Bearer <token>
X-Tenant-Id: <uuid>
Content-Type: multipart/form-data

visitorId: <uuid>
image: <file>
```

### Example: Verify (Kiosk QR flow)

```http
POST /api/face/verify
Authorization: Bearer <token>
X-Tenant-Id: <uuid>
Content-Type: multipart/form-data

visitorId: <uuid>
image: <file>
```

Response:
```json
{
  "success": true,
  "data": {
    "verified": true,
    "visitorId": "660e8400-...",
    "visitorName": "Abhinav Gahlaut",
    "similarity": 96.5,
    "message": "Identity verified"
  }
}
```

## Local Development

### Prerequisites

- Java 21
- Maven 3.9+
- Docker & Docker Compose
- AWS account with Rekognition + S3 access
- IAM user with `logbook360-face-policy` attached (see [DEPLOY.md](DEPLOY.md))

### Setup

1. Copy env template:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Fill in `.env`:
   ```
   AWS_ACCESS_KEY_ID=<key>
   AWS_SECRET_ACCESS_KEY=<secret>
   AWS_S3_BUCKET=logbook360-face-dev
   REKOGNITION_COLLECTION_PREFIX=logbook360-dev
   JWT_SECRET=<48-char random string>
   ADMIN_CLIENT_ID=logbook360-admin
   ADMIN_CLIENT_SECRET=<secret>
   KIOSK_CLIENT_ID=logbook360-kiosk
   KIOSK_CLIENT_SECRET=<secret>
   ```

3. Copy frontend env template:
   ```powershell
   Copy-Item frontend/.env.example frontend/.env.local
   ```

4. Fill in `frontend/.env.local`:
   ```
   VITE_ADMIN_CLIENT_ID=logbook360-admin
   VITE_ADMIN_CLIENT_SECRET=<secret>
   VITE_KIOSK_CLIENT_ID=logbook360-kiosk
   VITE_KIOSK_CLIENT_SECRET=<secret>
   VITE_COGNITO_IDENTITY_POOL_ID=ap-south-1:<pool-id>
   VITE_AWS_REGION=ap-south-1
   VITE_TENANT_ID=<your-tenant-uuid>
   ```

5. Start PostgreSQL:
   ```powershell
   docker compose up postgres -d
   ```

6. Run backend:
   ```powershell
   mvn spring-boot:run "-Dspring-boot.run.profiles=local"
   ```
   Backend starts on `http://localhost:8080`.

7. Run frontend:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   Frontend starts on `http://localhost:3000`.

### Run Tests

```powershell
mvn test
```

## Database Schema

Managed by Flyway. Migrations in `src/main/resources/db/migration/`.

| Table | Purpose |
|---|---|
| `tenants` | Tenant registry |
| `visitors` | Visitor records (name, email, phone) |
| `visitor_faces` | Face enrollment data (rekognitionFaceId, S3 key, confidence) |
| `recognition_logs` | Audit log for all face recognition events |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_URL` | Yes | — | JDBC connection string |
| `DB_USERNAME` | Yes | — | DB user |
| `DB_PASSWORD` | Yes | — | DB password |
| `AWS_REGION` | Yes | `ap-south-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | Local only | — | IAM key (omit in prod — use IAM task role) |
| `AWS_SECRET_ACCESS_KEY` | Local only | — | IAM secret (omit in prod — use IAM task role) |
| `AWS_S3_BUCKET` | Yes | — | S3 bucket name |
| `REKOGNITION_COLLECTION_PREFIX` | Yes | `logbook360` | Prefix for Rekognition collections |
| `REKOGNITION_SIMILARITY_THRESHOLD` | No | `90.0` | Min similarity score (0–100) |
| `FACE_LIVENESS_ENABLED` | No | `false` | Enable AWS Rekognition Face Liveness |
| `REKOGNITION_LIVENESS_CONFIDENCE_THRESHOLD` | No | `80.0` | Min liveness confidence (0–100) |
| `JWT_SECRET` | Yes | — | HS256 signing key (min 32 chars) |
| `JWT_EXPIRY_HOURS` | No | `24` | Token validity in hours |
| `ADMIN_CLIENT_ID` | Yes | — | Admin role client ID |
| `ADMIN_CLIENT_SECRET` | Yes | — | Admin role client secret |
| `KIOSK_CLIENT_ID` | Yes | — | Kiosk role client ID |
| `KIOSK_CLIENT_SECRET` | Yes | — | Kiosk role client secret |

## Project Structure

```
src/main/java/com/logbook360/facerec/
├── config/          # AWS, Security, properties config
├── controller/      # FaceController, AuthController, LivenessController
├── domain/          # JPA entities (Visitor, VisitorFace, Tenant, RecognitionLog)
├── dto/             # Request/response DTOs (EnrollmentDto, ApiResponse, ...)
├── exception/       # Domain exceptions + GlobalExceptionHandler
├── repository/      # Spring Data JPA repos
├── security/        # JwtService, JwtFilter
└── service/         # Business logic
    └── liveness/    # LivenessProvider, NoOpLivenessProvider

frontend/src/
├── api/             # faceApi.js, authApi.js
└── components/      # EnrollPage, IdentifyPage, DeletePage, KioskPage,
                     # RegisterPage, AdminPage, AccessResult
```

## Implementation Status

| Phase | Feature | Status |
|---|---|---|
| 1 | Enroll / Identify / Delete | **Complete** |
| 2 | Face Verify + Kiosk UI (MediaPipe tracking, QR scan, liveness) | **Complete** |
| 3 | JWT Auth (ADMIN/KIOSK) + AWS Face Liveness + Admin dashboard | **Complete** |
| 4 | Production deploy (ECS Fargate + RDS + GitHub Actions CI/CD) | Planned |
