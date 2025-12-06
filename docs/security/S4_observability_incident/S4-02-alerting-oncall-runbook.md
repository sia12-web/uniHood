# S4-02: Alerting, On-Call & Runbooks

> Status: ⚠️ **Partial** — Basic alerts exist in `infra/prometheus/alerting_rules.yml`

## Goals

- Turn metric thresholds into actionable alerts with playbooks
- Define on-call escalation procedures
- Enable rapid incident response

## Current Alerts

Location: `infra/prometheus/alerting_rules.yml`

| Alert | Condition | Severity |
|-------|-----------|----------|
| `DivanHighErrorRate` | 5xx rate > 5% for 10min | warning |
| `DivanHighLatencyP95` | p95 > 400ms for 15min | warning |
| `DivanRedisDown` | Redis ping fails for 2min | critical |
| `DivanPostgresDown` | Postgres check fails for 2min | critical |
| `DivanSocketClientDrop` | Socket.IO clients drop > 50% in 5min | warning |

## Required Additional Alerts

### Security Alerts

```yaml
# Add to alerting_rules.yml
groups:
  - name: security_alerts
    rules:
      - alert: DivanAuthBruteForce
        expr: |
          sum(rate(divan_auth_failures_by_ip[5m])) by (ip_prefix) > 10
          OR
          sum(rate(divan_auth_failures_by_user[5m])) by (user_id_prefix) > 5
        for: 2m
        labels:
          severity: critical
          category: security
        annotations:
          summary: "Potential brute-force attack detected"
          description: "High auth failure rate from {{ $labels.ip_prefix }} or user {{ $labels.user_id_prefix }}"

      - alert: DivanRefreshTokenReuse
        expr: sum(rate(divan_refresh_reuse_detected_total[5m])) > 0
        for: 1m
        labels:
          severity: critical
          category: security
        annotations:
          summary: "Refresh token reuse detected"
          description: "Possible session hijacking attempt"

      - alert: DivanHighDataExfil
        expr: |
          sum(rate(divan_data_export_requests_total[10m])) by (user_id) > 3
          OR
          sum(rate(divan_attachment_downloads_total[10m])) by (user_id) > 50
        for: 5m
        labels:
          severity: warning
          category: security
        annotations:
          summary: "Potential data exfiltration"
          description: "User {{ $labels.user_id }} downloading unusual volume"
```

## Playbooks

### Playbook 1: Auth Brute-Force Attack

**Alert:** `DivanAuthBruteForce`

**Trigger Conditions:**
- `auth_failure_count > 50/min` across unique users from same IP
- Same user > 10 failures in 5 minutes

**Automated Actions:**
1. Rate limiter auto-blocks offending IP (already implemented in `backend/app/infra/rate_limit.py`)
2. Alert fires to on-call

**Manual Response:**
```bash
# 1. Check recent auth failures
docker compose exec postgres psql -U postgres -d divan -c "
  SELECT ip, COUNT(*) as failures, MAX(created_at)
  FROM audit_logs
  WHERE event_type = 'login_failed'
    AND created_at > NOW() - INTERVAL '1 hour'
  GROUP BY ip
  ORDER BY failures DESC
  LIMIT 20;
"

# 2. Check if IP is already blocked
docker compose exec redis redis-cli KEYS "rate:login:ip:*"

# 3. Manually block IP if needed
docker compose exec redis redis-cli SETEX "block:ip:{IP}" 3600 "manual_block"

# 4. Check affected user accounts
docker compose exec postgres psql -U postgres -d divan -c "
  SELECT u.email, u.handle, COUNT(*) as attempts
  FROM audit_logs a
  JOIN users u ON u.id::text = a.user_id
  WHERE a.event_type = 'login_failed'
    AND a.created_at > NOW() - INTERVAL '1 hour'
  GROUP BY u.id, u.email, u.handle
  ORDER BY attempts DESC
  LIMIT 10;
"
```

**Escalation:**
- If attack persists > 15 minutes: Escalate to security lead
- If multiple IPs coordinated: Consider WAF rule or upstream block

---

### Playbook 2: Refresh Token Reuse (Session Hijacking)

**Alert:** `DivanRefreshTokenReuse`

**Trigger Conditions:**
- Refresh token used after it was already rotated
- Detected in `backend/app/domain/identity/sessions.py`

**Automated Actions:**
1. All sessions for affected user are revoked (already implemented)
2. Audit log entry created

**Manual Response:**
```bash
# 1. Identify affected user
docker compose exec postgres psql -U postgres -d divan -c "
  SELECT * FROM audit_logs
  WHERE event_type = 'refresh_reuse_detected'
  ORDER BY created_at DESC
  LIMIT 10;
"

# 2. Check user's session history
docker compose exec postgres psql -U postgres -d divan -c "
  SELECT id, ip, user_agent, created_at, revoked
  FROM sessions
  WHERE user_id = '{USER_ID}'
  ORDER BY created_at DESC;
"

# 3. Force password reset (if compromise confirmed)
# Notify user via email (manual process)

# 4. Check for suspicious login patterns
docker compose exec postgres psql -U postgres -d divan -c "
  SELECT ip, user_agent, COUNT(*) as logins
  FROM sessions
  WHERE user_id = '{USER_ID}'
  GROUP BY ip, user_agent;
"
```

**Escalation:**
- Notify user of suspicious activity
- If multiple users affected: Initiate incident response

---

### Playbook 3: Data Exfiltration Attempt

**Alert:** `DivanHighDataExfil`

**Trigger Conditions:**
- User downloads > 50 attachments in 10 minutes
- User requests > 3 data exports in 10 minutes

**Automated Actions:**
1. (TODO) Rate limit download endpoints per user

**Manual Response:**
```bash
# 1. Identify user and download patterns
docker compose exec postgres psql -U postgres -d divan -c "
  SELECT * FROM data_export_jobs
  WHERE user_id = '{USER_ID}'
  ORDER BY created_at DESC;
"

# 2. Check user's recent activity
docker compose exec postgres psql -U postgres -d divan -c "
  SELECT event_type, COUNT(*), MAX(created_at)
  FROM audit_logs
  WHERE user_id = '{USER_ID}'
    AND created_at > NOW() - INTERVAL '1 hour'
  GROUP BY event_type;
"

# 3. Suspend user's access token if needed
docker compose exec redis redis-cli DEL "session:refresh:{SESSION_ID}"

# 4. Lock account (set flag in DB)
docker compose exec postgres psql -U postgres -d divan -c "
  UPDATE users SET status = jsonb_set(COALESCE(status, '{}'), '{locked}', 'true')
  WHERE id = '{USER_ID}';
"
```

**Escalation:**
- Open security incident ticket
- Preserve audit logs for investigation

---

### Playbook 4: High Error Rate

**Alert:** `DivanHighErrorRate`

**Trigger Conditions:**
- 5xx error rate > 5% for 10 minutes

**Manual Response:**
```bash
# 1. Check recent errors
docker compose logs backend --since 10m | grep -i error

# 2. Check which routes are failing
docker compose exec prometheus promtool query instant \
  'topk(10, sum(rate(divan_http_5xx_total[5m])) by (route))'

# 3. Check database connectivity
docker compose exec backend python -c "
from app.infra.postgres import get_pool
import asyncio
async def check():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print(await conn.fetchval('SELECT 1'))
asyncio.run(check())
"

# 4. Check Redis connectivity
docker compose exec redis redis-cli PING
```

---

## On-Call Procedures

### Contact List

| Role | Primary | Backup | Contact |
|------|---------|--------|---------|
| Backend On-Call | TBD | TBD | PagerDuty/Slack |
| Security Lead | TBD | TBD | PagerDuty/Slack |
| Infrastructure | TBD | TBD | PagerDuty/Slack |

### Escalation Policy

```
Level 1 (0-15 min):  Primary on-call
Level 2 (15-30 min): Backup on-call
Level 3 (30+ min):   Security lead + Infrastructure
Critical:            Immediate all-hands
```

### Required Logs to Collect

For any security incident:
1. Audit logs from `audit_logs` table
2. Application logs (last 1 hour)
3. Rate limit logs from Redis
4. Session table for affected users
5. Prometheus metrics snapshot

## Action Items

1. [ ] Add security alerts to `alerting_rules.yml`
2. [ ] Configure PagerDuty/Slack integration
3. [ ] Set up on-call rotation
4. [ ] Create incident response Slack channel
5. [ ] Test playbooks quarterly
