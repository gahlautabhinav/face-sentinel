# LogBook360 Face Recognition — Claude Context

## Knowledge Graph (RAG)

This project has a graphify knowledge graph at `graphify-out/`. Use it for code navigation:

- **`graphify-out/GRAPH_REPORT.md`** — start here: god nodes, communities, surprising connections, knowledge gaps
- **`graphify-out/aws-lbfr-wiki/`** — per-file and per-symbol markdown wiki pages (one file per class/function)
- **`graphify-out/graph.json`** — raw edge/node data for deep lookups

### How to use for lookups

Before searching the codebase for a symbol, check:
1. `graphify-out/aws-lbfr-wiki/<ClassName>.md` — class overview + relationships
2. `graphify-out/aws-lbfr-wiki/<ClassName>.java.md` — file-level context

### God Nodes (most connected — touch these carefully)

| Node | Edges | Role |
|---|---|---|
| `VisitorFaceRepository` | 12 | Used by enroll, identify, verify, delete |
| `GlobalExceptionHandler` | 11 | Catches all domain exceptions, wraps in `ApiResponse` |
| `FaceEnrollmentService` | 10 | Core enrollment logic |
| `VisitorFace` | 9 | JPA entity — face enrollment record |
| `FaceNotFoundException` | 8 | Thrown on missing enrolled face |
| `RecognitionLogRepository` | 8 | Audit log for all recognition events |
| `FaceController` | 8 | REST entry point |
| `ApiResponse` | 7 | Universal response wrapper |
| `FaceIdentificationService` | 7 | Tenant-wide face search |

### Community Map (navigate by feature area)

| Community | Files/Classes |
|---|---|
| Face Enrollment + S3 | `FaceEnrollmentService`, `S3Service`, `RekognitionService` |
| Face Identification + Verification | `FaceIdentificationService`, `NoOpLivenessProvider`, `VisitorFaceRepository.findByRekognitionFaceIdAndTenantId` |
| Recognition Log + Exceptions | `RecognitionLog`, `VisitorFace`, `FaceNotFoundException`, `FaceDeletionService` |
| Controller API | `FaceController`, `FaceControllerTest` |
| Exception Handling | `GlobalExceptionHandler`, `ApiResponse` |
| AWS Config | `AwsConfig` — credentials via `@Value`, `StaticCredentialsProvider` / `DefaultCredentialsProvider` |
| Frontend API | `faceApi.js` — `enrollFace()`, `identifyFace()`, `deleteFace()` |
| Frontend Kiosk (Phase 2) | `KioskPage`, `AccessResult`, `jsQR` — planned, not yet implemented |
| JWT Auth (Phase 3) | Planned only |
| Deployment | `DEPLOY.md`, ECS Fargate, RDS, GitHub Actions |

---

## Architecture

**Multi-tenant Rekognition collections:**
```
{REKOGNITION_COLLECTION_PREFIX}-{tenantId}
# e.g. logbook360-dev-550e8400-e29b-41d4-a716-446655440000
```

**Request flow:**
```
FaceController
  └── FaceEnrollmentService / FaceIdentificationService / FaceVerificationService / FaceDeletionService
        └── RekognitionService (AWS SDK v2)
        └── S3Service (AWS SDK v2)
        └── VisitorFaceRepository / VisitorRepository / RecognitionLogRepository (JPA)
```

**Error flow:**
```
Domain Exception (FaceNotFoundException, etc.)
  └── GlobalExceptionHandler (@ControllerAdvice)
        └── ApiResponse.error(...)
```

---

## Critical: AWS Credential Loading

`spring-dotenv` (me.paulschwarz:spring-dotenv:4.0.0) injects `.env` into Spring `Environment` ONLY — NOT into `System.getenv()`. AWS SDK `DefaultCredentialsProvider` reads `System.getenv()` directly.

**Fix already applied in `AwsConfig.java`:**
- Credentials injected via `@Value("${AWS_ACCESS_KEY_ID:}")`
- `StaticCredentialsProvider` when keys present
- `DefaultCredentialsProvider` as fallback (picks up IAM task role in prod)

**Never revert this to plain `DefaultCredentialsProvider`.**

---

## Implementation Status

| Phase | Feature | Status |
|---|---|---|
| 1 | Enroll / Identify / Delete | **Complete + tested** |
| 2 | `POST /api/face/verify` + Kiosk React UI | **In progress** |
| 3 | JWT Auth (ADMIN / KIOSK roles, JJWT 0.12.6) | Planned |
| 4 | ECS Fargate + RDS + GitHub Actions CI/CD | Planned |

Phase 2 plan: `plan2.md` (gitignored — check conversation history or plan file).

---

## Key File Locations

| What | Where |
|---|---|
| Spring config | `src/main/resources/application.yml` |
| Local profile | `src/main/resources/application-local.yml` |
| DB migrations | `src/main/resources/db/migration/V1__initial_schema.sql` |
| AWS clients | `src/main/java/com/logbook360/facerec/config/AwsConfig.java` |
| REST controller | `src/main/java/com/logbook360/facerec/controller/FaceController.java` |
| Frontend API | `frontend/src/api/faceApi.js` |
| Docker Compose | `docker-compose.yml` |
| Deploy guide | `DEPLOY.md` |

---

## Conventions

- All endpoints require `X-Tenant-Id: <uuid>` header
- All responses use `ApiResponse<T>` wrapper: `{ success, data, message }`
- Max image upload: 10 MB (`spring.servlet.multipart.max-file-size`)
- Similarity threshold default: 90.0 (prod: 92.0)
- Liveness disabled by default (`FACE_LIVENESS_ENABLED=false`)
- Tests: Mockito unit tests, no real AWS calls, no DB in tests
- Commit author: `gahlautabhinav <abhinav.gahlaut@gmail.com>`
