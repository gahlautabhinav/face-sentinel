# Integration Guide — LogBook360 Face Recognition Module

This guide explains how to integrate the face recognition service into an existing visitor management system (VMS), access control system, or any web application.

---

## Integration Modes

| Mode | What you embed | Best for |
|---|---|---|
| **API-only** | Call REST endpoints from your backend | You have your own UI |
| **Kiosk UI embed** | Drop the React kiosk page into your app | You want a ready-made kiosk screen |
| **Full frontend embed** | Use both Admin + Kiosk React pages | Greenfield or replacing existing VMS UI |

---

## Mode 1 — API-Only Integration

Your backend calls the face recognition service as a microservice. No UI dependency.

### Step 1: Provision a Tenant

Create a tenant record in the `tenants` table. The `tenantId` (UUID) is the namespace for all face data.

```sql
INSERT INTO tenants (id, name) VALUES ('550e8400-e29b-41d4-a716-446655440000', 'YourOrg');
```

Or expose a tenant management endpoint in your own admin system.

### Step 2: Get an Auth Token

Your backend obtains a JWT once and reuses it (valid for 24 hours by default):

```http
POST http://<facerec-host>/api/auth/token
Content-Type: application/json

{
  "clientId": "logbook360-admin",
  "clientSecret": "<your-admin-secret>"
}
```

Response:
```json
{ "success": true, "data": { "token": "eyJ..." } }
```

Store the token and refresh on 401.

### Step 3: Create a Visitor + Enroll Face

When a visitor registers in your system, enroll their face:

```http
POST http://<facerec-host>/api/face/enroll
Authorization: Bearer <admin-token>
X-Tenant-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: multipart/form-data

visitorId: <your-visitor-uuid>
image: <jpeg or png file>
```

Response:
```json
{
  "success": true,
  "data": {
    "visitorId": "660e8400-...",
    "rekognitionFaceId": "abc-123-...",
    "confidence": 99.8,
    "message": "Face enrolled successfully"
  }
}
```

The `visitorId` must match the visitor's ID in your own database.

### Step 4: Identify at Kiosk

When a visitor stands at an access point, capture a frame and POST it:

```http
POST http://<facerec-host>/api/face/identify
Authorization: Bearer <kiosk-token>
X-Tenant-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: multipart/form-data

image: <jpeg frame>
```

Response — matched:
```json
{
  "success": true,
  "data": {
    "matched": true,
    "visitorId": "660e8400-...",
    "visitorName": "John Smith",
    "similarity": 96.5,
    "message": "Visitor identified successfully"
  }
}
```

Response — no match:
```json
{
  "success": true,
  "data": {
    "matched": false,
    "message": "No matching visitor found"
  }
}
```

Use `matched` to gate access in your system.

> **This endpoint does no liveness check.** A photo or a phone video of an enrolled person matches too. Call it only from a device and flow you trust (an attended desk, or after your own liveness step). For an unattended access point use the liveness flow instead: `POST /api/liveness/session`, run the AWS Face Liveness challenge in the browser, then `POST /api/liveness/identify` with `{ "sessionId": "...", "frameImage": "<optional base64 JPEG>" }`. That call returns `422` when liveness did not pass, and uses `frameImage` only when it shows the same person who passed liveness.

### Step 5: Delete Enrollment (Optional)

When a visitor leaves or is removed:

```http
DELETE http://<facerec-host>/api/face/{visitorId}
Authorization: Bearer <admin-token>
X-Tenant-Id: <tenantId>
```

---

## Mode 2 — Kiosk UI Embed

Embed the kiosk React page in your frontend. The kiosk runs fully standalone — it detects faces, checks liveness, and shows the result screen.

Liveness is the AWS Face Liveness challenge, with an optional **fast path** in front of it: an on-device anti-spoof model plus a blink check that can grant a strong match at once and otherwise falls through to the challenge. The fast path is decided in the browser, so validate it against printed photos and phone videos on your own hardware, or switch it off with `VITE_KIOSK_FAST_PATH=false`. See "Liveness and the Fast Path" in the README.

### Option A: Iframe

Host the kiosk frontend separately and embed it:

```html
<iframe
  src="https://kiosk.yourdomain.com?tenant=550e8400-..."
  style="width:100vw; height:100vh; border:none;"
  allow="camera"
/>
```

Pass the tenant ID as a query param and read it in `getKioskTenantId()`:

```js
// frontend/src/components/KioskPage.jsx
function getKioskTenantId() {
  return new URLSearchParams(window.location.search).get('tenant')
    || import.meta.env.VITE_TENANT_ID
}
```

### Option B: React Component Import

If your app is also React, import `KioskPage` directly:

```bash
# In your project
npm install --save ../lb-face-recog/frontend  # or publish as npm package
```

```jsx
import KioskPage from 'lb-face-recog/KioskPage'

export default function AccessPointScreen() {
  return <KioskPage />
}
```

Set env vars in your app's `.env`:
```env
VITE_TENANT_ID=550e8400-e29b-41d4-a716-446655440000
VITE_KIOSK_CLIENT_ID=logbook360-kiosk
VITE_KIOSK_CLIENT_SECRET=<secret>
VITE_ADMIN_CLIENT_ID=logbook360-admin
VITE_ADMIN_CLIENT_SECRET=<secret>
VITE_COGNITO_IDENTITY_POOL_ID=ap-south-1:<pool-id>
VITE_AWS_REGION=ap-south-1
```

---

## Mode 3 — Full Frontend Embed

Use both Admin and Kiosk pages. Routes:

| Route | Component | Purpose |
|---|---|---|
| `/kiosk` | `KioskPage` | Access control screen |
| `/admin` | `AdminPage` | Enroll, list, delete visitors |
| `/enroll` | `EnrollPage` | Single-visitor enrollment form |

Add these routes to your React Router config:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import KioskPage from './components/KioskPage'
import AdminPage from './components/AdminPage'

<BrowserRouter>
  <Routes>
    <Route path="/kiosk" element={<KioskPage />} />
    <Route path="/admin/*" element={<AdminPage />} />
  </Routes>
</BrowserRouter>
```

---

## Receiving Access Events in Your System

The face recognition service logs all events to `recognition_logs`. To receive real-time access events in your system, two options:

### Option A: Poll the REST API (simple)

```http
GET http://<facerec-host>/api/face/enrollments
Authorization: Bearer <admin-token>
X-Tenant-Id: <tenantId>
```

Or query `recognition_logs` directly if you have shared DB access.

### Option B: Outbound Webhook (custom — not built-in, add if needed)

Add a `@Component` in the Spring Boot service that publishes to your webhook after each identify:

```java
// In FaceIdentificationService, after successful match:
webhookService.post(tenantId, visitorId, similarity, RecognitionAction.IDENTIFY);
```

Contact the team to configure a webhook endpoint if needed.

---

## Multi-Tenant Setup

Each site, building, or customer is a separate tenant. All face data is isolated by `tenantId`.

```
Tenant A: logbook360-dev-550e8400-...  (Building A)
Tenant B: logbook360-dev-660e8400-...  (Building B)
```

To add a new tenant:
1. Insert into `tenants` table
2. The Rekognition collection is auto-created on first enroll
3. Pass the tenant's UUID as `X-Tenant-Id` in all API calls
4. Set `VITE_TENANT_ID` in the kiosk deployment for that location

---

## AWS Prerequisites

The face recognition service requires these AWS resources:

| Resource | Purpose |
|---|---|
| IAM user or task role | `AmazonRekognitionFullAccess` + `AmazonS3FullAccess` |
| S3 bucket | Stores enrolled face images |
| Rekognition Face Liveness | Enable in AWS console for your region |
| IAM `rekognition:CompareFaces` | Needed by `POST /api/liveness/identify` (full policy in DEPLOY.md) |
| Cognito Identity Pool | Required by the AWS Amplify liveness SDK in the frontend |

### Cognito Identity Pool (for liveness UI)

The kiosk liveness detector (`@aws-amplify/ui-react-liveness`) requires a Cognito Identity Pool for unauthenticated access to Rekognition:

1. Create an Identity Pool in AWS Console → Cognito → Identity Pools
2. Enable unauthenticated access
3. Attach `AmazonRekognitionReadOnlyAccess` to the unauthenticated role
4. Set `VITE_COGNITO_IDENTITY_POOL_ID=ap-south-1:<pool-id>`

---

## Backend Deployment Options

### Standalone JAR

```bash
mvn package -DskipTests
java -jar target/facerec-*.jar
```

### Docker

```bash
docker build -t logbook360-facerec .
docker run -p 8080:8080 --env-file .env logbook360-facerec
```

### Docker Compose (with PostgreSQL)

```bash
docker compose up --build
```

### Production (ECS Fargate)

See [DEPLOY.md](DEPLOY.md) for full ECS Fargate + RDS + GitHub Actions setup.

Key prod differences:
- Remove `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from env — use IAM task role
- Set `REKOGNITION_SIMILARITY_THRESHOLD=90.0` (higher = stricter)
- Set `FACE_LIVENESS_ENABLED=false` (liveness is handled by the kiosk UI, not the identify endpoint)

---

## CORS Configuration

By default the backend allows the local dev server under both of its names, `http://localhost:3000` and `http://127.0.0.1:3000`. A page opened from any other origin gets `403` on every API call, including the token request. For production, update `SecurityConfig.java` (and the matching list in `CorsConfig.java`):

```java
config.setAllowedOrigins(List.of(
    "https://kiosk.yourdomain.com",
    "https://admin.yourdomain.com"
));
```

Or extract to an env variable:

```java
@Value("${ALLOWED_ORIGINS:http://localhost:3000}")
private String allowedOrigins;

config.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));
```

---

## Similarity Threshold Tuning

| Environment | Recommended threshold | Notes |
|---|---|---|
| Local dev | 75.0 | Lower for easy testing |
| Staging | 85.0 | Realistic but forgiving |
| Production | 90.0–92.0 | Strict — fewer false accepts |

Set via `REKOGNITION_SIMILARITY_THRESHOLD` env var or in `application-local.yml`:
```yaml
aws:
  rekognition:
    similarity-threshold: 85.0
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Token expired or wrong credentials | Re-fetch token; check client ID/secret |
| `403 Forbidden` | Wrong role (ADMIN endpoint called with KIOSK token) | Use correct token for endpoint |
| `403` on every call, even `/api/auth/token`, body `Invalid CORS request` | Page opened from an origin the backend does not allow | Open it on `localhost:3000` or `127.0.0.1:3000`, or add your origin to the allowlist (see CORS Configuration) |
| `404` on identify | Rekognition face ID exists but no DB record | Orphaned face — re-enroll visitor |
| `matched: false` for known person | Similarity below threshold or bad angle during challenge | Lower threshold in dev (`75.0`); ensure enrolment photo is well-lit and front-facing |
| Liveness "TIMEOUT" | User too slow or face not visible | Instruct user to remove coverings, use better lighting |
| Liveness glitches / exits immediately | Camera conflict — two streams racing | Ensure only one browser tab is open; hard reload clears WebRTC state |
| "Face not recognized — look directly at camera and try again" for enrolled person | Liveness image below threshold and the pre-captured frame did not rescue it | Look directly at camera during countdown; ensure enrolment photo is high quality |
| "Not Enrolled" for an enrolled person | Two no-match results in a row | Same as above; re-enroll with a clear front-facing image |
| "Connection problem" at the kiosk | Backend, network or AWS error during the scan (never a spoof verdict) | Check backend logs. A `500` right after liveness passes usually means the IAM policy lacks `rekognition:CompareFaces` |
| "One at a time" keeps showing | Another face nearly as large as the front one is in frame | Others step back; the front face must be clearly larger (others at most 0.4 of its area) |
| "Face detection offline" | MediaPipe could not load from its CDN, or keeps failing | Check the kiosk's internet access; "Tap to scan" still runs the AWS challenge |
| "Camera unavailable" | Permission denied, camera missing or unplugged | Allow camera access for the page, press Retry |
| Fast path never grants instantly | No blink seen in ~2 s, match below 93, low light, cooldown after a failed scan, or models failed to load (see browser console `[fast path]`) | Normal fallback is the AWS challenge. Open `/kiosk?debug` to see the reason live; tune thresholds in `frontend/src/kioskLogic.mjs` |
| An enrolled person is "not recognized" now and then | An older copy of their face is still in the Rekognition collection without a database record | Handled: the server skips such stale faces and uses the next match. Backend log shows `has no visitor record … skipping` |
| AWS credentials error | `spring-dotenv` only injects into Spring env, not `System.getenv()` | Use `@Value` in `AwsConfig` — already implemented |
| Kiosk shows "Poor lighting" | Avg frame luminance < 30 | Improve ambient lighting at kiosk location |
| Face covering warning always on | MediaPipe confidence < 0.65 | Check lighting; ensure face is fully visible |
