# Production Readiness Checklist

This document outlines the necessary steps and configurations to prepare the **Divan** platform for a production environment.

## 1. Infrastructure & Architecture

### Containerization
- [x] **Frontend**: Create a multi-stage Dockerfile for `frontend` to build the Next.js app and serve it (using `next start` or a standalone node server). ✅ `frontend/Dockerfile`
- [ ] **Activities Core**: Create a Dockerfile for `services/activities-core`.
- [x] **Orchestration**: Update `docker-compose.yml` (or create `docker-compose.prod.yml`) to include all services with `restart: always` policies. ✅ `docker-compose.prod.yml`

### Reverse Proxy & SSL
- [x] **Reverse Proxy**: Set up **Caddy** to sit in front of all services. ✅ `infra/caddy/Caddyfile`
    - Route `/api/*` -> Backend (`8000`)
    - Route `/activities/session/*` -> Activities Core (`3001`)
    - Route `/*` -> Frontend (`3000`)
- [x] **SSL/TLS**: Configure **Let's Encrypt** for HTTPS (automatic with Caddy). ✅

## 2. Environment Configuration

### Security Secrets
- [x] Environment template created: `.env.production.example` ✅
Ensure the following environment variables are set securely (do NOT commit them to git):
- `SECRET_KEY`: High-entropy random string for backend crypto.
- `SERVICE_SIGNING_KEY`: For inter-service communication signing.
- `REFRESH_PEPPER`: For hashing refresh tokens.
- `POSTGRES_PASSWORD`: Strong database password.
- `OBS_ADMIN_TOKEN`: For accessing observability endpoints.

### Feature Flags
- `ENVIRONMENT`: Set to `production`.
- `INTENT_SIGNING_REQUIRED`: Set to `True`.
- `COOKIE_SECURE`: Set to `True` (requires HTTPS).
- `COOKIE_DOMAIN`: Set to your production domain (e.g., `.divan.app`).
- `CORS_ALLOW_ORIGINS`: Set strictly to your frontend domain (e.g., `https://divan.app`).

## 3. Database & Storage

### PostgreSQL
- [ ] **Managed Service**: Consider using a managed Postgres (AWS RDS, Google Cloud SQL, DigitalOcean) for automated backups and high availability.
- [ ] **Migrations**: Ensure `python /work/scripts/apply_migrations.py` runs automatically before the backend starts.
- [ ] **Collation**: If using a new DB, ensure the collation warning is resolved by initializing the DB with the correct locale.

### Object Storage (S3)
- [ ] **Uploads**: The current local file upload system (`app/uploads`) is for **development only**.
- [ ] **Configuration**: Configure AWS S3, Cloudflare R2, or MinIO:
    - `S3_BUCKET_NAME`
    - `S3_REGION`
    - `S3_ACCESS_KEY`
    - `S3_SECRET_KEY`

## 4. Backend (FastAPI)

- [ ] **Workers**: Run `uvicorn` with multiple workers in production for concurrency.
    - Command: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`
- [ ] **Email**: Configure a real SMTP provider (SendGrid, AWS SES, Postmark).
    - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`.
    - Disable the dev-mode email logging.

## 5. Frontend (Next.js)

- [ ] **Build**: Ensure `npm run build` passes without errors.
- [ ] **Image Optimization**: If deploying to Vercel, this is automatic. If Dockerizing, ensure `sharp` is installed for `next/image` optimization.
- [ ] **Environment**: Bake public env vars (`NEXT_PUBLIC_*`) into the build time image, or use runtime configuration.

## 6. Activities Core (Node.js)

- [ ] **Process Management**: Use `pm2` or Docker to keep the process alive.
- [ ] **Scaling**: If running multiple instances, configure a **Redis Adapter** for Socket.IO so users on different servers can talk to each other.

## 7. Observability & Monitoring

- [ ] **Logs**: Configure a centralized logging driver (e.g., AWS CloudWatch, Datadog, or ELK stack).
- [ ] **Metrics**: The backend exposes Prometheus metrics. Scrape them using Prometheus/Grafana.
- [ ] **Sentry**: Set up Sentry for error tracking in both Backend and Frontend.

## 8. Final Verification

- [ ] **Auth Flow**: Test Sign Up, Login, and **Email Verification** (ensure the dev bypass is disabled).
- [ ] **WebSockets**: Verify real-time games work through the reverse proxy (requires correct WebSocket upgrade headers in Nginx).
- [ ] **Security Headers**: Check for HSTS, X-Frame-Options, and CSP headers.
