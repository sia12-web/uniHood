# S4-01: Monitoring & Metrics

> Status: ✅ **Implemented** — Core infrastructure exists in `backend/app/obs/metrics.py`

## Goals

- Define what to monitor and alert on
- Ensure comprehensive visibility into security and operational health
- Enable rapid incident detection

## Current Implementation

### Metrics Module

Location: `backend/app/obs/metrics.py` (~1100 lines)

The project uses **Prometheus** with the `prometheus_client` library. Metrics are exposed at `/obs/metrics` (protected by admin token unless `OBS_METRICS_PUBLIC=true`).

### Metrics Categories

#### 1. Authentication & Security Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `intents_verified_total` | Counter | - | Successful signed intent verifications |
| `intents_failed_sig_total` | Counter | - | Failed signature verifications |
| `intents_replay_total` | Counter | - | Replay attack attempts detected |
| `divan_identity_logins_total` | Counter | `outcome` | Login attempts (success/fail) |
| `divan_identity_rejects_total` | Counter | `reason` | Auth rejections by reason |

**TODO - Add these metrics:**
```python
# auth_failure_count per minute per IP & per user
auth_failure_by_ip = Counter('divan_auth_failures_by_ip', 'Auth failures', ['ip_prefix'])
auth_failure_by_user = Counter('divan_auth_failures_by_user', 'Auth failures', ['user_id_prefix'])

# Refresh token events
refresh_token_rotations = Counter('divan_refresh_rotations_total', 'Refresh token rotations')
refresh_token_failures = Counter('divan_refresh_failures_total', 'Refresh token failures', ['reason'])
```

#### 2. Rate Limiting Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `divan_rate_limit_hits_total` | Counter | `bucket` | Rate limit activations |

**TODO - Add:**
```python
requests_per_minute_by_ip = Histogram('divan_requests_per_minute_ip', 'Requests per IP', ['ip_prefix'])
blocked_requests = Counter('divan_blocked_requests_total', 'Blocked by rate limit', ['reason'])
```

#### 3. HTTP & Latency Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `divan_http_requests_total` | Counter | `method`, `route`, `status` | Total HTTP requests |
| `divan_http_request_duration_seconds` | Histogram | `method`, `route` | Request latency |
| `divan_http_5xx_total` | Counter | `route` | Server errors |

#### 4. Socket.IO / Real-time Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `divan_socketio_clients` | Gauge | - | Active WebSocket connections |
| `divan_socketio_events_total` | Counter | `event` | Events by type |
| `divan_comm_socket_connections_active` | Gauge | - | Active connections |

#### 5. Business Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `divan_community_posts_created_total` | Counter | - | Posts created |
| `divan_events_created_total` | Counter | - | Events created |
| `divan_event_rsvps_updated_total` | Counter | - | RSVPs |
| `divan_presence_heartbeats_total` | Counter | - | Presence heartbeats |
| `divan_proximity_queries_total` | Counter | - | Nearby queries |

**TODO - Add:**
```python
invites_sent = Counter('divan_invites_sent_total', 'Invites sent')
messages_sent = Counter('divan_messages_sent_total', 'Chat messages sent')
rooms_created = Counter('divan_rooms_created_total', 'Chat rooms created')
```

#### 6. Infrastructure Health Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `divan_redis_up` | Gauge | - | Redis availability (1=up) |
| `divan_postgres_up` | Gauge | - | Postgres availability (1=up) |
| `divan_redis_ping_latency_seconds` | Gauge | - | Redis ping latency |
| `divan_postgres_roundtrip_seconds` | Gauge | - | Postgres query latency |

**TODO - Add:**
```python
db_connections_active = Gauge('divan_db_connections_active', 'Active DB connections')
redis_queue_lag = Gauge('divan_redis_queue_lag', 'Message queue lag')
```

#### 7. Error Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `divan_http_5xx_total` | Counter | `route` | 5xx errors by route |
| `divan_unhandled_exceptions_total` | Counter | `type` | Unhandled exceptions |

## Middleware Integration

Location: `backend/app/infra/middleware.py`

```python
# Already implemented:
- Request timing middleware
- Request ID injection
- Metrics recording per route
```

## SLIs/SLOs

Define in Grafana or alerting rules:

| SLI | Target SLO | Current Alert |
|-----|------------|---------------|
| Availability (non-5xx) | 99.9% | `DivanHighErrorRate` (5% threshold) |
| Latency p95 | < 400ms | `DivanHighLatencyP95` |
| Redis availability | 99.99% | `DivanRedisDown` |
| Postgres availability | 99.99% | `DivanPostgresDown` |

## Docker Compose Integration

```yaml
# Already in infra/prometheus/prometheus.yml
scrape_configs:
  - job_name: 'divan-backend'
    static_configs:
      - targets: ['backend:8000']
    metrics_path: '/obs/metrics'
```

## Action Items

1. [ ] Add auth failure metrics with IP/user labels
2. [ ] Add refresh token rotation/failure metrics
3. [ ] Add business metrics (invites, messages, rooms)
4. [ ] Add DB connection pool metrics
5. [ ] Review SLO thresholds quarterly
