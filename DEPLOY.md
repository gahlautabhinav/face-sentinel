# Deployment Guide

Covers local Docker Compose, AWS IAM setup, and production deployment to ECS Fargate.

---

## IAM Setup (Required for All Environments)

### IAM Policy

Create policy `logbook360-face-policy` in AWS IAM console:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:CreateCollection",
        "rekognition:DescribeCollection",
        "rekognition:DeleteFaces"
      ],
      "Resource": "arn:aws:rekognition:ap-south-1:*:collection/logbook360-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:DetectFaces",
        "rekognition:CreateFaceLivenessSession",
        "rekognition:GetFaceLivenessSessionResults"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::logbook360-*/*"
    }
  ]
}
```

### S3 Bucket Settings

For bucket `logbook360-face-dev` (and prod equivalent):
- Block all public access: **ON**
- Server-side encryption: **SSE-AES256**
- Versioning: optional (recommended for prod)

---

## Local: Docker Compose

Runs both Postgres and the Spring Boot app in Docker.

### Prerequisites

- Docker Desktop
- `.env` file with AWS credentials and JWT secrets (see `.env.example`)

### Steps

```powershell
# Build jar first
mvn package -DskipTests

# Start all services
docker compose up --build

# Or start only Postgres (for running backend outside Docker)
docker compose up postgres -d
```

App available at `http://localhost:8080`.

**Never commit `.env` or `frontend/.env.local` to git.**

---

## Local: Run Without Docker

```powershell
# Start Postgres only
docker compose up postgres -d

# Run Spring Boot with local profile
mvn spring-boot:run "-Dspring-boot.run.profiles=local"
```

Profile `local` (`application-local.yml`) sets:
- DB: `localhost:5435`
- Region: `ap-south-1`
- Collection prefix: `logbook360-dev`
- Liveness: disabled

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend starts on `http://localhost:3000`. Requires `frontend/.env.local` with:

```
VITE_ADMIN_CLIENT_ID=logbook360-admin
VITE_ADMIN_CLIENT_SECRET=<same as backend ADMIN_CLIENT_SECRET>
VITE_KIOSK_CLIENT_ID=logbook360-kiosk
VITE_KIOSK_CLIENT_SECRET=<same as backend KIOSK_CLIENT_SECRET>
VITE_COGNITO_IDENTITY_POOL_ID=ap-south-1:<pool-id>
VITE_AWS_REGION=ap-south-1
VITE_TENANT_ID=<your-tenant-uuid>
```

---

## Cognito Identity Pool (Face Liveness)

The kiosk and enrollment UI uses AWS Amplify's `FaceLivenessDetector`, which needs temporary AWS credentials in the browser. Use a Cognito Identity Pool with unauthenticated access.

1. **AWS Console → Cognito → Identity Pools → Create identity pool**
   - Name: `logbook360-liveness-pool`
   - Enable unauthenticated identities: **ON**
   - Create pool → AWS auto-creates two IAM roles
   - Note the **Identity Pool ID** (format: `ap-south-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

2. **Restrict the unauthenticated IAM role** (`Cognito_logbook360livenesspoolUnauth_Role`):
   - IAM → Roles → find the unauth role → edit inline policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": "rekognition:StartFaceLivenessSession",
       "Resource": "*"
     }]
   }
   ```
   - Remove all other permissions — this role should have **only** `StartFaceLivenessSession`.

3. Add `VITE_COGNITO_IDENTITY_POOL_ID` to `frontend/.env.local`.

---

## Production: AWS ECS Fargate

### Architecture

```
GitHub Actions
  └── mvn test
  └── mvn package
  └── docker build → ECR push
  └── ecs update-service

ALB (HTTPS :443)
  └── ECS Fargate (logbook360-face-service)
        └── IAM Task Role (no hardcoded keys)
        └── RDS PostgreSQL (private subnet)
        └── Secrets Manager → DB password, JWT secret, client secrets
```

### Step 1: ECR Repository

```bash
aws ecr create-repository \
  --repository-name logbook360-face-recognition \
  --region ap-south-1
```

### Step 2: RDS PostgreSQL

- Engine: PostgreSQL 15
- Instance: `db.t3.medium` (minimum for prod)
- Multi-AZ: recommended
- Storage: 20 GB gp3, encrypted
- VPC: same VPC as ECS cluster, private subnets only
- Security group: allow inbound 5432 from ECS task security group only

Spring Boot runs Flyway migrations automatically on startup.

### Step 3: IAM Task Role

Create IAM role `logbook360-face-task-role` with trust policy for ECS tasks:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

Attach `logbook360-face-policy` to this role. **No access keys needed in ECS** — `DefaultCredentialsProvider` picks up the task role automatically.

### Step 4: Secrets Manager

Store secrets:
```
logbook360/face-service/db-password       → RDS password
logbook360/face-service/jwt-secret        → random 48-char string
logbook360/face-service/admin-secret      → ADMIN_CLIENT_SECRET
logbook360/face-service/kiosk-secret      → KIOSK_CLIENT_SECRET
```

In ECS task definition, inject secrets as environment variables:
```json
[
  { "name": "DB_PASSWORD",         "valueFrom": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:logbook360/face-service/db-password" },
  { "name": "JWT_SECRET",          "valueFrom": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:logbook360/face-service/jwt-secret" },
  { "name": "ADMIN_CLIENT_SECRET", "valueFrom": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:logbook360/face-service/admin-secret" },
  { "name": "KIOSK_CLIENT_SECRET", "valueFrom": "arn:aws:secretsmanager:ap-south-1:ACCOUNT:secret:logbook360/face-service/kiosk-secret" }
]
```

### Step 5: ECS Task Definition

Key settings:
```json
{
  "cpu": "512",
  "memory": "1024",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/logbook360-face-task-role",
  "environment": [
    { "name": "SPRING_PROFILES_ACTIVE",              "value": "prod" },
    { "name": "DB_URL",                              "value": "jdbc:postgresql://RDS_ENDPOINT:5432/logbook360_face" },
    { "name": "DB_USERNAME",                         "value": "postgres" },
    { "name": "AWS_REGION",                          "value": "ap-south-1" },
    { "name": "AWS_S3_BUCKET",                       "value": "logbook360-face-prod" },
    { "name": "REKOGNITION_COLLECTION_PREFIX",       "value": "logbook360" },
    { "name": "REKOGNITION_SIMILARITY_THRESHOLD",    "value": "92.0" },
    { "name": "FACE_LIVENESS_ENABLED",               "value": "false" },
    { "name": "REKOGNITION_LIVENESS_CONFIDENCE_THRESHOLD", "value": "80.0" },
    { "name": "JWT_EXPIRY_HOURS",                    "value": "24" },
    { "name": "ADMIN_CLIENT_ID",                     "value": "logbook360-admin" },
    { "name": "KIOSK_CLIENT_ID",                     "value": "logbook360-kiosk" }
  ]
}
```

`ADMIN_CLIENT_SECRET`, `KIOSK_CLIENT_SECRET`, `JWT_SECRET`, `DB_PASSWORD` come from Secrets Manager (Step 4).
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are **not set** — task role handles auth.

### Step 6: GitHub Actions CI/CD

`.github/workflows/deploy.yml`:

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin' }
      - run: mvn test
      - run: mvn package -DskipTests
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1
      - name: Build and push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker build -t $ECR_REGISTRY/logbook360-face-recognition:$GITHUB_SHA .
          docker push $ECR_REGISTRY/logbook360-face-recognition:$GITHUB_SHA
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster logbook360 \
            --service logbook360-face-service \
            --force-new-deployment
```

Required GitHub secrets:
- `AWS_ACCESS_KEY_ID` — CI/CD IAM user key (NOT the app IAM user)
- `AWS_SECRET_ACCESS_KEY` — CI/CD IAM user secret
- `ECR_REGISTRY` — `ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com`

---

## Production Profile

`src/main/resources/application-prod.yml`:

```yaml
spring:
  datasource:
    url: ${DB_URL}
  jpa:
    show-sql: false

aws:
  rekognition:
    collection-prefix: logbook360
    similarity-threshold: 92.0
```

---

## Health Check

```bash
curl http://localhost:8080/actuator/health
```

Add `spring-boot-starter-actuator` dependency before deploying to prod (required for ALB target group health check).

---

## Security Checklist

- [ ] `.env` and `frontend/.env.local` never committed (covered by `.gitignore`)
- [ ] No `AWS_ACCESS_KEY_ID` in ECS task definition (use IAM task role)
- [ ] S3 bucket has block-all-public-access enabled
- [ ] S3 bucket has SSE-AES256 encryption
- [ ] IAM policy scoped to `logbook360-*` resources only
- [ ] RDS in private subnet only
- [ ] JWT secret stored in Secrets Manager (not in env/code)
- [ ] `ADMIN_CLIENT_SECRET` and `KIOSK_CLIENT_SECRET` stored in Secrets Manager
- [ ] `REKOGNITION_SIMILARITY_THRESHOLD` at 92.0+ in production
- [ ] Cognito Identity Pool created, unauth role restricted to `rekognition:StartFaceLivenessSession` only
- [ ] `VITE_COGNITO_IDENTITY_POOL_ID` set in frontend environment
- [ ] Liveness IAM permissions in `logbook360-face-policy`: `CreateFaceLivenessSession`, `GetFaceLivenessSessionResults`
- [ ] `REKOGNITION_LIVENESS_CONFIDENCE_THRESHOLD` set (80.0 default, raise for higher security)
- [ ] `AwsConfig.java` uses `@Value` + `StaticCredentialsProvider` (never revert to plain `DefaultCredentialsProvider` — spring-dotenv only injects into Spring Environment, not `System.getenv()`)
