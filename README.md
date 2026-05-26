# LogBook360 Face Recognition Service

Microservice handling visitor face enrollment, identification, and verification using AWS Rekognition and S3. Designed for multi-tenant kiosk access control.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 3.3.2, Java 21 |
| Face AI | AWS Rekognition (ap-south-1) |
| Storage | AWS S3 |
| Database | PostgreSQL 15 + Flyway |
| Frontend (dev UI) | React + Vite |
| Container | Docker / Docker Compose |

## Architecture Overview

```
Main LogBook360 App
  └── Visitor registration → POST /api/face/enroll → stores rekognitionFaceId
  └── Generates QR code (visitorId + tenantId) → given to visitor

Kiosk (React, WebRTC, browser)
  └── Visitor shows QR → jsQR decodes → extracts visitorId + tenantId
  └── Camera auto-captures face frames
  └── POST /api/face/verify (tenantId + visitorId + image)
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

## API Endpoints

| Method | Path | Header | Description |
|---|---|---|---|
| POST | `/api/face/enroll` | `X-Tenant-Id` | Enroll visitor face |
| POST | `/api/face/identify` | `X-Tenant-Id` | Identify unknown face (tenant-wide search) |
| POST | `/api/face/verify` | `X-Tenant-Id` | Verify specific visitor face (QR-first kiosk flow) |
| DELETE | `/api/face/{visitorId}` | `X-Tenant-Id` | Remove enrolled face |

### Enroll

```http
POST /api/face/enroll
X-Tenant-Id: <uuid>
Content-Type: multipart/form-data

visitorId: <uuid>
image: <file>
```

### Verify (Kiosk)

```http
POST /api/face/verify
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
   ```

3. Start PostgreSQL:
   ```powershell
   docker compose up postgres -d
   ```

4. Run backend:
   ```powershell
   mvn spring-boot:run -Dspring-boot.run.profiles=local
   ```
   Backend starts on `http://localhost:8080`.

5. Run frontend (dev UI):
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
| `visitors` | Visitor records |
| `visitor_faces` | Face enrollment data (rekognitionFaceId + S3 key) |
| `recognition_logs` | Audit log for all face recognition events |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_URL` | Yes | — | JDBC connection string |
| `DB_USERNAME` | Yes | — | DB user |
| `DB_PASSWORD` | Yes | — | DB password |
| `AWS_REGION` | Yes | `ap-south-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | Local only | — | IAM key (omit in prod — use IAM role) |
| `AWS_SECRET_ACCESS_KEY` | Local only | — | IAM secret (omit in prod — use IAM role) |
| `AWS_S3_BUCKET` | Yes | — | S3 bucket name |
| `REKOGNITION_COLLECTION_PREFIX` | Yes | `logbook360` | Prefix for Rekognition collections |
| `REKOGNITION_SIMILARITY_THRESHOLD` | No | `90.0` | Min similarity score (0–100) |
| `FACE_LIVENESS_ENABLED` | No | `false` | Enable AWS liveness detection |

## Project Structure

```
src/main/java/com/logbook360/facerec/
├── config/          # AWS, CORS, properties config
├── controller/      # REST endpoints
├── domain/          # JPA entities
├── dto/response/    # API response DTOs
├── exception/       # Domain exceptions + global handler
├── repository/      # Spring Data JPA repos
└── service/         # Business logic
    └── liveness/    # Liveness detection providers

frontend/src/
├── api/             # Backend API calls
└── components/      # React pages (Enroll, Identify, Delete, Kiosk)
```

## Implementation Status

| Phase | Feature | Status |
|---|---|---|
| 1 | Enroll / Identify / Delete | Complete |
| 2 | Face Verify endpoint + Kiosk UI | In progress |
| 3 | JWT Authentication (ADMIN / KIOSK roles) | Planned |
| 4 | Production deploy (ECS Fargate + RDS) | Planned |
