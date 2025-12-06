# O2-01: Data Retention & Legal Request Policy

> Status: ⚠️ **Partial** — Retention windows documented in `infra/hardening/phase_B`, implementation pending

## Goals

- Define clear retention windows for all data categories
- Establish process for handling legal/law enforcement requests
- Ensure compliance with PIPEDA (Canada) and applicable privacy laws

## Data Categories & Retention

### User Data

| Category | Examples | Retention | Justification |
|----------|----------|-----------|---------------|
| **Profile (active)** | Name, email, avatar | While account active | Core service |
| **Profile (deleted)** | Anonymized | 30 days then purge | Grace period |
| **Credentials** | Password hash | While account active | Authentication |
| **2FA secrets** | TOTP seed | While enabled | Security |

### Communication Data

| Category | Examples | Retention | Justification |
|----------|----------|-----------|---------------|
| **Messages** | Chat messages | 365 days default | User expectation |
| **Attachments** | Images, files | 90 days | Storage management |
| **Message metadata** | Timestamps, read status | 365 days | Matches messages |

### Activity Data

| Category | Examples | Retention | Justification |
|----------|----------|-----------|---------------|
| **Session logs** | Login IPs, devices | 180 days | Security auditing |
| **Audit logs** | Actions, changes | 365 days | Compliance |
| **Location data** | Proximity pings | 7 days | Privacy |
| **Analytics events** | Page views, clicks | 90 days | Product improvement |

### System Data

| Category | Examples | Retention | Justification |
|----------|----------|-----------|---------------|
| **Application logs** | Errors, requests | 30 days | Debugging |
| **Security logs** | Auth failures, blocks | 180 days | Incident response |
| **Metrics** | Prometheus data | 15 days raw, 365 days aggregated | Monitoring |

## Retention Enforcement

### Automated Purge Jobs

```python
# backend/app/jobs/retention.py

from datetime import datetime, timedelta

RETENTION_POLICIES = {
    "messages": timedelta(days=365),
    "attachments": timedelta(days=90),
    "sessions": timedelta(days=180),
    "audit_logs": timedelta(days=365),
    "location_history": timedelta(days=7),
    "analytics_events": timedelta(days=90),
}

async def run_retention_purge():
    """Daily job to enforce retention policies."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        for table, retention in RETENTION_POLICIES.items():
            cutoff = datetime.utcnow() - retention
            
            # Soft delete first (if applicable)
            if table in ["messages", "attachments"]:
                await conn.execute(f"""
                    UPDATE {table}
                    SET deleted_at = NOW()
                    WHERE created_at < $1
                      AND deleted_at IS NULL
                """, cutoff)
            
            # Hard delete after grace period
            hard_delete_cutoff = cutoff - timedelta(days=30)
            result = await conn.execute(f"""
                DELETE FROM {table}
                WHERE created_at < $1
            """, hard_delete_cutoff)
            
            logger.info(f"Purged {result} rows from {table}")
```

### Scheduled Jobs

```yaml
# docker-compose.yml addition

services:
  scheduler:
    image: divan-backend
    command: python -m app.jobs.scheduler
    environment:
      - JOB_RETENTION_PURGE=0 3 * * *  # 3 AM daily
```

## Legal Request Handling

### Request Types

| Type | Description | Authority | Response Time |
|------|-------------|-----------|---------------|
| **Subpoena** | Civil case data request | Court | 30 days |
| **Court Order** | Criminal investigation | Judge | As specified |
| **Warrant** | Search/seizure | Judge + Law enforcement | Immediate |
| **Preservation Request** | Hold data | Law enforcement | 90 days hold |
| **User Request** | PIPEDA access/deletion | Data subject | 30 days |

### Handling Procedure

```
┌─────────────────┐
│ Request Received│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Log Request    │
│  (confidential) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Valid Authority?│──No─▶│ Reject + Log    │
└────────┬────────┘     └─────────────────┘
         │Yes
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Scope Review    │────▶│ Legal Counsel   │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Data Collection │
│ (minimal scope) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Secure Transfer │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Document Chain  │
│ of Custody      │
└─────────────────┘
```

### Data Production Scope

**Always provide minimum necessary data:**

| Request For | Provide | Do NOT Provide |
|-------------|---------|----------------|
| User identity | Name, email, phone | Password hash, 2FA secrets |
| Messages | Specific date range | All historical |
| Location | Specific timestamps | Location history |
| Activity | Relevant actions | All audit logs |

### Response Template

```markdown
# Legal Data Production Report

**Request ID:** LR-2024-XXX
**Date Received:** YYYY-MM-DD
**Requesting Authority:** [Agency/Court]
**Legal Basis:** [Subpoena/Warrant/Court Order #]

## Scope
Data requested: [Description]
Date range: [Start] to [End]
Users affected: [Count]

## Data Produced
| Data Type | Records | Format |
|-----------|---------|--------|
| User profile | X | JSON |
| Messages | X | JSON |
| ... | ... | ... |

## Chain of Custody
- Prepared by: [Name], [Title]
- Reviewed by: [Legal counsel]
- Transferred via: [Secure method]
- Received by: [Recipient]

## Notes
- [Any limitations or caveats]

## Attestation
I attest that this data was collected and produced in accordance
with the legal request and company policy.

Signature: _____________
Date: YYYY-MM-DD
```

### Preservation Holds

```python
# backend/app/domain/legal/holds.py

async def create_preservation_hold(
    user_ids: list[UUID],
    request_id: str,
    expires_at: datetime,
):
    """Create legal hold preventing data deletion."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO legal_holds (id, user_ids, request_id, expires_at)
            VALUES ($1, $2, $3, $4)
        """, uuid4(), user_ids, request_id, expires_at)
        
        # Update retention job to skip held data
        for user_id in user_ids:
            await conn.execute("""
                UPDATE users
                SET metadata = jsonb_set(
                    COALESCE(metadata, '{}'),
                    '{legal_hold}',
                    'true'
                )
                WHERE id = $1
            """, user_id)

async def check_legal_hold(user_id: UUID) -> bool:
    """Check if user data is under legal hold."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval("""
            SELECT EXISTS(
                SELECT 1 FROM legal_holds
                WHERE $1 = ANY(user_ids)
                  AND expires_at > NOW()
            )
        """, user_id)
```

## User Data Requests (PIPEDA)

### Access Request

Users can request a copy of their data:

| Data | Included | Format |
|------|----------|--------|
| Profile | ✅ | JSON |
| Messages sent | ✅ | JSON |
| Messages received | ❌ (other party's data) | - |
| Posts | ✅ | JSON |
| Login history | ✅ | JSON |
| Location history | ✅ | JSON |

### Deletion Request

See `F3-01-privacy-controls.md` for user-initiated deletion.

### Correction Request

```python
async def process_correction_request(
    user_id: UUID,
    field: str,
    old_value: str,
    new_value: str,
    evidence: str,
):
    """Process user data correction request."""
    # Log request
    await audit.log_event(
        "data_correction_request",
        user_id=str(user_id),
        meta={"field": field, "requested": new_value},
    )
    
    # Review required for sensitive fields
    SENSITIVE_FIELDS = {"email", "phone", "name"}
    if field in SENSITIVE_FIELDS:
        # Create ticket for manual review
        await create_support_ticket(
            type="data_correction",
            user_id=user_id,
            details={"field": field, "evidence": evidence},
        )
    else:
        # Auto-approve non-sensitive corrections
        await update_profile_field(user_id, field, new_value)
```

## Logging & Audit Trail

### Legal Request Log

```sql
CREATE TABLE legal_request_log (
    id UUID PRIMARY KEY,
    request_type VARCHAR(50) NOT NULL,
    authority VARCHAR(255) NOT NULL,
    reference_number VARCHAR(100),
    received_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    user_ids UUID[],
    data_types TEXT[],
    notes TEXT,
    handled_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for compliance reporting
CREATE INDEX idx_legal_requests_date ON legal_request_log(received_at);
```

### Required Logging

Every legal request must log:
- Date/time received
- Type of request
- Requesting authority
- Scope of data requested
- Data actually provided
- Person who handled request
- Date/time of response

## Action Items

1. [ ] Implement automated retention purge job
2. [ ] Create `legal_holds` table and enforcement
3. [ ] Build data production tooling for legal requests
4. [ ] Train team on legal request handling
5. [ ] Establish relationship with legal counsel
6. [ ] Create legal request intake form/process
7. [ ] Document chain of custody procedures
8. [ ] Review annually for policy updates
