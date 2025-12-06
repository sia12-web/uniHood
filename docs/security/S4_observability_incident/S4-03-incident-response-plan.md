# S4-03: Incident Response Plan

> Status: 📋 **New** — Formalizes incident handling procedures

## Goals

- Formalize the incident response lifecycle: Identify → Triage → Contain → Eradicate → Recover → Learn
- Ensure consistent handling across incident types
- Minimize blast radius and recovery time

## Incident Classification

### Severity Levels

| Severity | Impact | Response Time | Examples |
|----------|--------|---------------|----------|
| **SEV-1 Critical** | Data breach, service down, active attack | < 15 min | Credential leak, DB compromise, DDoS |
| **SEV-2 High** | Security incident, major degradation | < 1 hour | Brute-force attack, partial outage |
| **SEV-3 Medium** | Contained security issue, minor impact | < 4 hours | Single account compromise, bug |
| **SEV-4 Low** | Potential issue, no active impact | < 24 hours | Vulnerability report, suspicious activity |

### Impact Categories

- **Confidentiality (C):** Data exposed or stolen
- **Integrity (I):** Data modified or corrupted
- **Availability (A):** Service disrupted or unavailable

## Incident Response Phases

### Phase 1: Identification

**Goal:** Confirm an incident is occurring and assess initial scope.

**Sources:**
- Prometheus/Grafana alerts (see `S4-01`, `S4-02`)
- Audit log anomalies
- User reports
- External reports (bug bounty, security researchers)

**Actions:**
```
1. Acknowledge alert within SLA
2. Open incident channel: #incident-{YYYY-MM-DD}-{short-name}
3. Assign Incident Commander (IC)
4. Initial assessment:
   - What is happening?
   - When did it start?
   - What systems/users affected?
   - Is it ongoing?
5. Declare severity level
6. Page appropriate teams if needed
```

**Template - Initial Assessment:**
```markdown
## Incident: {SHORT_NAME}
**Severity:** SEV-{N}
**Impact:** C/I/A
**Status:** Active / Contained / Resolved

### Timeline
- {TIME}: Alert triggered / Issue reported
- {TIME}: IC assigned
- {TIME}: ...

### Initial Findings
- Affected systems:
- Affected users:
- Attack vector (if known):

### Immediate Actions Taken
- ...
```

---

### Phase 2: Triage

**Goal:** Determine scope, severity, and immediate priorities.

**Actions:**
```
1. Gather evidence (preserve logs, don't modify)
2. Identify:
   - Root cause (if possible)
   - Blast radius (users, data, systems)
   - Attack vector / entry point
3. Update severity if needed
4. Notify stakeholders (leadership, legal if data breach)
5. Document everything in incident channel
```

**Evidence Collection Commands:**
```bash
# Export relevant audit logs
docker compose exec postgres psql -U postgres -d divan -c "
  COPY (
    SELECT * FROM audit_logs
    WHERE created_at > '{START_TIME}'
    ORDER BY created_at
  ) TO STDOUT WITH CSV HEADER
" > incident_audit_logs.csv

# Export sessions for affected users
docker compose exec postgres psql -U postgres -d divan -c "
  COPY (
    SELECT * FROM sessions
    WHERE user_id IN ('{USER_IDS}')
  ) TO STDOUT WITH CSV HEADER
" > incident_sessions.csv

# Capture application logs
docker compose logs backend --since {DURATION} > incident_app_logs.txt

# Snapshot Prometheus metrics
curl -s "http://localhost:9090/api/v1/query?query=..." > metrics_snapshot.json
```

---

### Phase 3: Containment

**Goal:** Stop the bleeding — prevent further damage.

**Short-term Containment:**
```
1. Revoke compromised credentials/tokens
2. Block malicious IPs/users
3. Isolate affected services (feature flags)
4. Enable additional logging if needed
```

**Containment Actions by Incident Type:**

| Incident | Containment Actions |
|----------|---------------------|
| **Credential Compromise** | Rotate affected secrets, revoke user sessions, force password reset |
| **API Abuse** | Block IP, increase rate limits, enable additional auth |
| **Data Breach** | Disable affected endpoints, revoke access tokens |
| **Service Attack** | Enable WAF rules, scale capacity, failover |

**Commands:**
```bash
# Revoke all sessions for a user
docker compose exec postgres psql -U postgres -d divan -c "
  UPDATE sessions SET revoked = TRUE WHERE user_id = '{USER_ID}';
"
docker compose exec redis redis-cli KEYS "session:refresh:{USER_ID}:*" | xargs redis-cli DEL

# Block IP address
docker compose exec redis redis-cli SETEX "block:ip:{IP}" 86400 "incident_block"

# Disable feature (if feature flags exist)
docker compose exec redis redis-cli HSET "feature_flags" "{FEATURE}" "disabled"

# Rotate JWT signing key (requires deployment)
# See O1-02-secrets-rotation-policy.md
```

---

### Phase 4: Eradication

**Goal:** Remove the threat completely.

**Actions:**
```
1. Remove malicious code/backdoors
2. Patch vulnerabilities exploited
3. Remove compromised accounts/credentials
4. Update security configurations
5. Verify no persistence mechanisms remain
```

**Checklist:**
- [ ] Identified and removed all malicious artifacts
- [ ] Patched or mitigated vulnerability
- [ ] Rotated all potentially compromised credentials
- [ ] Reviewed related systems for similar issues
- [ ] Updated detection rules to catch similar attacks

---

### Phase 5: Recovery

**Goal:** Restore normal operations with confidence.

**Actions:**
```
1. Restore from known-good backups if needed
2. Gradually re-enable services
3. Monitor closely for recurrence
4. Validate data integrity
5. Confirm security controls are effective
```

**Recovery Validation:**
```bash
# Verify database integrity
docker compose exec postgres psql -U postgres -d divan -c "
  SELECT COUNT(*) FROM users WHERE email IS NULL;
  SELECT COUNT(*) FROM sessions WHERE user_id NOT IN (SELECT id FROM users);
"

# Verify authentication works
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Verify monitoring is active
curl http://localhost:8000/obs/metrics | grep divan_http_requests_total
```

---

### Phase 6: Post-Incident Review (Postmortem)

**Goal:** Learn and prevent recurrence.

**Timeline:** Within 5 business days of resolution.

**Postmortem Template:**
```markdown
# Postmortem: {INCIDENT_NAME}
**Date:** {DATE}
**Severity:** SEV-{N}
**Duration:** {START} - {END} ({DURATION})
**Author:** {NAME}

## Summary
{2-3 sentence summary of what happened}

## Impact
- Users affected: {N}
- Data exposed: {Y/N, details}
- Downtime: {duration}
- Financial impact: {if applicable}

## Timeline
| Time | Event |
|------|-------|
| ... | ... |

## Root Cause
{Technical explanation of what went wrong}

## Detection
How was this discovered? What alerts fired?

## Response
What actions were taken? What worked? What didn't?

## Lessons Learned
### What went well
- ...

### What could be improved
- ...

## Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| ... | ... | ... | ... |

## Prevention
What changes will prevent this from happening again?
```

**Postmortem Meeting:**
- Blameless review
- Focus on systems, not individuals
- Document action items with owners
- Share learnings broadly

---

## Communication Templates

### Internal Notification (SEV-1/2)
```
🚨 SECURITY INCIDENT - SEV-{N}

**Summary:** {brief description}
**Status:** Active / Contained / Resolved
**Impact:** {affected users/services}

**Incident Commander:** @{IC}
**Channel:** #incident-{name}

Please do not discuss outside this channel until cleared.
```

### External Notification (if data breach)
```
Subject: Security Incident Notification

Dear {User},

We are writing to inform you of a security incident that may have affected your account...

[Work with legal on actual communication]
```

## Action Items

1. [ ] Create incident Slack channel template
2. [ ] Set up evidence collection scripts
3. [ ] Define on-call IC rotation
4. [ ] Conduct tabletop exercise quarterly
5. [ ] Create postmortem document repository
