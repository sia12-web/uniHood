# Phase 8 — Observability & Ops / test_plan.md

## Objective
Validate that every observability component (health, metrics, logging, tracing, dashboards, alerts, load tests, frontend vitals) operates per spec without regressing prior phases.

## Test Matrix Overview
- Backend: unit + integration coverage for health, middleware, metrics hooks, tracing, logging, sockets
- Infra: Prometheus rules, Grafana dashboards, alert firing sanity
- Frontend: Web Vitals ingestion flow and auth gates
- Load: k6 scenarios for chat send + proximity queries
- Security: auth + PII redaction checks

## 1) Backend Unit/Integration Tests

### Health checks (`backend/tests/obs/test_health.py`)
1. Liveness returns 200 & `{status:"ok"}` even when deps fail.
2. Readiness fails (503) if Redis ping raises or >200ms; use async mocks to fail `redis_client.ping`.
3. Readiness fails if Postgres `SELECT 1` >300ms.
4. Readiness fails if migration version < `HEALTH_MIN_MIGRATION`.
5. Startup fails if OTLP endpoint missing when tracing enabled.

### Metrics Middleware (`backend/tests/obs/test_middleware.py`)
1. Request increments `divan_http_requests_total` with route template.
2. Histogram buckets increase; verify `0.05` bucket increments.
3. Request ID header propagated `X-Request-Id`.
4. When user id present in auth, log contains `user_id` but not token.

### Domain Metrics Hooks
- For each domain service (presence, proximity, invites, chat, rooms, activities, leaderboards), extend existing tests to assert metric increments via `prometheus_client.REGISTRY`. Add fixtures to reset collectors between tests.

### Tracing
1. `obs.tracing.init()` registers tracer provider.
2. `/ops/trace/test` emits span named `divan.trace.test` using OTLP stub exporter.
3. Database spans contain sanitized SQL (no raw user input).

### Logging
1. JSON log structure contains required keys.
2. Info sampling respected (mock `random.random` to assert drop).
3. Error logs always emitted.
4. Redaction: send message containing token → log omits `token`.

### Socket instrumentation
1. Connect/disconnect adjusts gauge.
2. Emitting event increments counter with namespace/event labels.

## 2) API Contract Tests (`backend/tests/api/test_ops_endpoints.py`)
- `/metrics` returns Prom format and requires auth unless `OBS_METRICS_PUBLIC=true`.
- `/ops/rollover` rejects non-admin (403); success triggers job mock.
- `/ops/trace/test` disabled when `ENV=prod`.

## 3) Frontend Web Vitals Tests (`frontend/__tests__/obs/webvitals.test.ts`)
- `reportWebVitals` posts CLS/LCP/INP to `/api/ops/ingest` only when env flag enabled.
- Payload omits user-identifying info; includes `page`, `value`, `id`.

## 4) Ingest Route Tests (`frontend/app/api/ops/ingest/route.test.ts`)
- Accepts POST with metrics JSON, forwards to OTLP collector stub.
- Rejects requests >10KB or missing required fields.
- Disabled in production env.

## 5) Infra Validation

### Prometheus
1. `rules-phase8.yml` passes `promtool check rules`.
2. Test scrape returns the new metrics (stand up docker stub or unit test with `prometheus_client` exposition).

### Grafana
1. Dashboard JSON passes `jq` formatting check.
2. Import dashboards into local Grafana; panels load without errors (manual QA).

### Alerts
1. Use `promtool test rules` with fixtures to trigger each alert scenario (high error rate, latency, redis down, socket drop).

## 6) Load Testing (k6)
- `k6 run infra/k6/chat_send_load.js`: expect p95 < 150ms, error rate <1%.
- `k6 run infra/k6/proximity_nearby_load.js`: expect p95 < 120ms.
- Store JSON output under `infra/k6/results/`.

## 7) Logging & Tracing Manual QA
- Run app with tracing enabled; confirm spans visible in collector/Jaeger.
- Logs emit JSON with trace ids matching spans.

## 8) Security / PII Checks
- `/metrics` and `/ops/*` respond 403 without admin token.
- Logs redact tokens/emails (simulated requests).
- Web vitals payload remains non-identifying.

## 9) Regression Matrix
- Re-run impacted phase 1–7 tests (chat send, proximity, invites, rooms) to ensure behaviour unchanged.

## Test Data / Fixtures
- Stub Redis/PG clients to simulate latency/failure.
- Fixtures to reset Prometheus registry.
- `settings_override` fixture for env flags.

## Exit Criteria
- All automated tests passing in CI.
- Load tests meet SLA thresholds & results archived.
- Grafana dashboards import without errors.
- Alerts validated with promtool.
- Manual PII/security checks complete.
