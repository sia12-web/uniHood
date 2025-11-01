# Phase 8 — Observability & Ops / spec.md

## Goal
Ship production-grade **health checks, metrics, tracing, logging, dashboards, and alerts** for all prior phases. Everything is **opt-in by config**, lightweight in dev, and safe for HA in prod.

## 0) Directory (adds)
backend/
	app/
		obs/                         # Observability package
			__init__.py
			metrics.py                 # Prometheus counters/histograms/gauges
			tracing.py                 # OpenTelemetry setup (OTLP)
			logging.py                 # JSON logs, request/trace correlation
			health.py                  # liveness/readiness, dependency probes
			middleware.py              # request metrics/tracing/log correlation
			sockets_obs.py             # Socket.IO connection counters
		api/ops.py                   # /health/*, /metrics endpoints (metrics via ASGI app)
	infra/
		prometheus/
			rules-phase8.yml           # alerting rules (PromQL)
		grafana/
			dashboards/
				backend-overview.json    # panels JSON (placeholders with query expressions)
				redis-postgres.json
				chat-proximity.json
		k6/
			chat_send_load.js          # simple load test for /chat send
			proximity_nearby_load.js
frontend/
	lib/obs/
		webvitals.ts                 # Web Vitals → /ops/ingest (optional, off by default)
	app/api/ops/ingest/route.ts    # (Next.js) optional metrics ingest proxy → OTLP collector

## 1) Exposed Endpoints (FastAPI)
- GET  `/health/live`        → always `{"status":"ok"}` if process responsive
- GET  `/health/ready`       → checks Redis/PG connectivity & critical migrations applied
- GET  `/health/startup`     → one-time boot checks (e.g., config validation)
- GET  `/metrics`            → Prometheus text
- POST `/ops/rollover`       → (internal, guarded) triggers daily LB snapshot/job (test hooks)
- POST `/ops/trace/test`     → emits a test span (sanity, forbidden in prod unless admin)

**Security**: `/metrics`, `/ops/*` require admin token unless `OBS_METRICS_PUBLIC=true` (dev only).

## 2) Logging (app/obs/logging.py)
- **JSON structured** logs (logfmt alternative off). Fields:
	- `ts`, `level`, `msg`, `service="divan-api"`, `env`, `commit`, `request_id`, `trace_id`, `span_id`, `route`, `status`, `latency_ms`, `user_id?`, `ip?`.
- Sampling:
	- Info logs sampled 1:10 under load; Errors never sampled.
- PII policy:
	- Never log message bodies, file keys, tokens, emails, or exact geo.
	- Truncate arrays/maps > 10 items.

## 3) Tracing (app/obs/tracing.py)
- **OpenTelemetry** SDK w/ auto-instrumentation:
	- FastAPI/ASGI
	- HTTPX/Requests
	- SQLAlchemy/asyncpg
	- aioredis/redis-py
	- socket.io (manual spans in handlers)
- Exporter: OTLP gRPC → Collector (`OTEL_EXPORTER_OTLP_ENDPOINT`).
- Span attrs (examples):
	- `http.route`, `http.status_code`, `db.system`, `db.statement` (sanitized), `redis.command`, `socketio.event`, `user.id?`.

## 4) Metrics (app/obs/metrics.py)
Prometheus **namespace `divan_`**. Provide the following (labels constrained; avoid high-cardinality):

### Request & Socket
- `divan_http_requests_total{route,method,status}` (Counter)
- `divan_http_request_duration_seconds{route,method}` (Histogram, buckets: [0.01..5])
- `divan_socketio_clients{namespace}` (Gauge)
- `divan_socketio_events_total{namespace,event}` (Counter)

### Phase 1–7 Domain Metrics (increment at existing code hooks)
- Presence: `divan_presence_heartbeats_total{campus_id}`, `divan_presence_rejects_total{reason}`
- Proximity: `divan_proximity_queries_total{radius}`
- Invites: `divan_invites_sent_total`, `divan_invites_accept_total`
- Friendships: `divan_friendships_accepted_total`
- Chat: `divan_chat_send_total`, `divan_chat_delivered_updates_total`, `divan_chat_read_updates_total`
- Rooms: `divan_rooms_created_total`, `divan_rooms_join_total`, `divan_rooms_send_total`
- Activities: `divan_activities_created_total{kind}`, `divan_activities_completed_total{kind}`
- Leaderboards: `divan_lb_events_processed_total{stream}`, `divan_lb_snapshots_total{period,scope}`

### Infra
- Redis ping gauge `divan_redis_up` (0/1), `divan_redis_latency_seconds` (Summary)
- Postgres `divan_postgres_up` (0/1), `divan_postgres_latency_seconds` (Summary)
- Background jobs:
	- `divan_jobs_runs_total{name, result}` (Counter)
	- `divan_jobs_duration_seconds{name}` (Histogram)

## 5) Health (app/obs/health.py)
- **Liveness**: process tick + event loop heartbeat.
- **Readiness**: pass if:
	- Redis `PING`<200ms
	- Postgres `SELECT 1`<300ms
	- Migrations at required version `PHASE_8_MIN_MIG`
- **Startup**: validate config (S3/Redis/PG URLs, JWT secret length, OTLP endpoint when tracing enabled).

Return JSON:

```
{"status":"ok","checks":{"redis":{"ok":true,"latency_ms":12},"postgres":{"ok":true,"latency_ms":22},"migrations":{"ok":true,"version":"0008"}}}
```

HTTP codes: 200 OK, 503 if any readiness check fails.

## 6) Middleware (app/obs/middleware.py)
- Assign `request_id` (uuid4) if missing.
- Log inbound/outbound with latency, status, route template.
- Increment request metrics histogram/counter.
- Inject correlation headers: `X-Request-Id`, `traceparent`.

## 7) Socket.IO instrumentation (app/obs/sockets_obs.py)
- On connect/disconnect: adjust `divan_socketio_clients`.
- Wrap handlers to count `divan_socketio_events_total{namespace,event}`.
- Attribute room size for fanout debugging (debug-only gauge).

## 8) Config Flags (env)

```
OBS_ENABLED=true
OBS_METRICS_PUBLIC=false
OBS_TRACING_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=grpc://otel-collector:4317
LOG_LEVEL=INFO
LOG_SAMPLING_RATE_INFO=0.1
HEALTH_MIN_MIGRATION=0008
```

## 9) Grafana — key panels (dashboards JSON provided)
- **Backend Overview**
	- RPS, p95 latency, error rate %
	- Socket.IO online clients by namespace
	- Redis/PG up & latency
- **Chat & Proximity**
	- Chat send rate, delivery/read updates
	- Nearby query rate & p95
- **Redis Streams Lag** (if using `xpending` exporter)
	- Per stream lag gauge
- **Leaderboards**
	- Events processed, snapshot durations

## 10) Prometheus Alert Rules (infra/prometheus/rules-phase8.yml)
- High error rate:
	- `rate(divan_http_requests_total{status=~"5.."}[5m]) / rate(divan_http_requests_total[5m]) > 0.05` for 10m
- API latency p95 > 400ms for 15m
- Redis/PG down (up==0) for 2m
- Socket client drop > 50% in 5m

## 11) Load Tests (infra/k6/*.js)
- `chat_send_load.js`: ramp 0→300 VUs; check <1% non-2xx, p95 < 150ms
- `proximity_nearby_load.js`: constant 200 rps geo queries; p95 < 120ms

## 12) Frontend Observability (optional)
- Web Vitals (CLS/LCP/INP) collected via `lib/obs/webvitals.ts` and sent to `/api/ops/ingest` (dev/staging only).
- Do not include user-identifying data.

## 13) Security/PII
- Redact tokens, emails, file keys, exact geo.
- Route sampling only logs path templates, never raw query bodies.

## 14) Wiring Instructions (Copilot)
- Call `obs.init(app)` in `app/main.py` which:
	- mounts `/metrics`, `/health/*`
	- installs middlewares
	- initializes OTel tracer/provider
- Replace ad-hoc prints with `obs.logger`.
- Add metric increments to existing domain services per spec.
