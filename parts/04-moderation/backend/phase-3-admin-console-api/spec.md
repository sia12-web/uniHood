# Moderation · Backend Phase 3 — Admin Console & Dashboard API

## 0) Goals / Non-Goals
- Goals: staff APIs for cases/audit, batch actions, dashboards (KPIs, charts), exports, caching, RBAC+rate limits.
- Non-Goals: web UI (handled by frontend later), ML ranking, cross-instance federation.

## 1) RBAC & Auth
- Scopes: `staff.moderator`, `staff.admin`.
- Campus scoping: moderators restricted to their campuses; admins are global.
- Every endpoint logs to `mod_audit` with `actor_id`, `action`, `meta`.

## 2) Queryability & Indexes (PostgreSQL 16)
```sql
-- Fast filters
CREATE INDEX IF NOT EXISTS idx_mod_case_status ON mod_case(status);
CREATE INDEX IF NOT EXISTS idx_mod_case_assigned ON mod_case(assigned_to) WHERE status='open';
CREATE INDEX IF NOT EXISTS idx_mod_case_severity ON mod_case(severity);
CREATE INDEX IF NOT EXISTS idx_mod_case_created ON mod_case(created_at DESC);

-- Text search (subject snapshot kept in cases.meta if desired) - optional
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Example: searchable note/reason fields
CREATE INDEX IF NOT EXISTS idx_mod_report_reason_trgm ON mod_report USING gin(reason_code gin_trgm_ops);

-- Audit time-based
CREATE INDEX IF NOT EXISTS idx_mod_audit_target ON mod_audit(target_id);


Note: If case search must include original content text, store a normalized text snapshot in mod_case.meta->>'subject_text' and index with GIN (to_tsvector('english', meta->>'subject_text')).
```

## 3) API (FastAPI) — /api/mod/v1/admin/* (staff-only)
### 3.1 Cases (list/detail/search/export)
```
GET    /admin/cases
GET    /admin/cases/{id}
POST   /admin/cases/batch_action
GET    /admin/cases/export.csv
```

Query params (list):

Filters: status (open|actioned|dismissed|escalated|closed), severity_min, severity_max, assigned_to (me|none|{uuid}), subject_type (multi), campus_id (multi), reason (report|auto_policy|escalation), appeal_open (bool), created_from, created_to.

Search: q (matches subject_id, reporter handle/email if available, or meta.subject_text when enabled).

Sort: sort=created_at|severity|updated_at, order=asc|desc.

Pagination: limit<=100, after (keyset {sort_field,id} base64).

Response:

```
type CaseListItem = {
  id: string; subject_type: string; subject_id: string; status: string;
  severity: number; reason: string; assigned_to?: string|null;
  campus_id?: string|null; created_at: string; updated_at: string;
  appeal_open: boolean; escalation_level: number;
};
type CaseList = { items: CaseListItem[]; next?: string; total_estimate?: number };
```

### 3.2 Batch action
```
POST /admin/cases/batch_action
Body: {
  case_ids: string[],
  action: 'assign'|'escalate'|'dismiss'|'apply_enforcement',
  payload?: any,            // e.g., {moderator_id}, {note}, {decision:'tombstone'}
  reason_note?: string
}
```

Validations:

- assign requires payload.moderator_id.
- apply_enforcement requires payload.decision ∈ actions (Phase 1).
- All write actions audited individually; partial failures returned per-id.

### 3.3 Audit viewer
```
GET /admin/audit?target_type?&target_id?&actor_id?&from?&to?&limit&after
```

Returns chronological entries with pagination.

### 3.4 Dashboards (widgets)
```
GET /admin/dashboard/kpis
GET /admin/dashboard/trends
GET /admin/dashboard/workload
GET /admin/dashboard/moderator_perf?from&to&moderator_id?
```

KPI payload (example):

```
type KPIs = {
  open_cases: number;
  new_reports_24h: number;
  actions_24h: number;
  median_tta_minutes_7d: number;   // time-to-action
  appeal_rate_7d: number;          // appeals / actioned
  reversal_rate_7d: number;        // appeals accepted / actioned
};
```

Trends:

time series buckets (hour/day): reports, cases_opened, actions_applied, appeals_received, appeals_accepted.

Workload:

queue depths by severity & campus, SLA breach counts (open > target minutes).

Moderator performance:

per moderator: cases_closed, median_tta, appeal_accept_rate, working_time_est (based on action windows).

### 3.5 CSV export

Streams a CSV of current filter set (up to 50k rows) with columns: case_id, subject_type, subject_id, status, severity, reason, assigned_to, campus_id, created_at, updated_at, last_action.

## 4) Keyset Pagination (cases)

Ordering defaults:

If sort=created_at: (created_at DESC, id DESC)

Cursor encodes the last tuple; server emits next when page is full.

## 5) Caching & Rate Limits

Dashboards: 15–60s cached in Redis (mod:dash:* keys).

List endpoints: no cache (live), but total_estimate optional via hyperloglog.

Staff rate limits: 60 req/10s per user per surface; CSV export 1/min.

## 6) SQL — Widgets (sketches)
```sql
-- KPIs (24h windows)
WITH
reports_24h AS (
  SELECT count(*) c FROM mod_report WHERE created_at >= now() - interval '24 hours'
),
actions_24h AS (
  SELECT count(*) c FROM mod_action WHERE created_at >= now() - interval '24 hours'
),
open_cases AS (
  SELECT count(*) c FROM mod_case WHERE status='open'
),
tta AS (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (a.created_at - c.created_at))/60)
  FROM mod_case c
  JOIN LATERAL (SELECT created_at FROM mod_action WHERE case_id=c.id ORDER BY created_at ASC LIMIT 1) a ON true
  WHERE c.created_at >= now() - interval '7 days'
)
SELECT
 (SELECT c FROM open_cases)                 AS open_cases,
 (SELECT c FROM reports_24h)               AS new_reports_24h,
 (SELECT c FROM actions_24h)               AS actions_24h,
 COALESCE((SELECT tta FROM tta),0)::float  AS median_tta_minutes_7d;
```

Trends use date_trunc('hour', created_at) grouping.

## 7) Batch Actions — Pseudocode
```python
@router.post("/admin/cases/batch_action")
@requires("staff.moderator")
def batch_action(req: BatchReq, user=Depends(current_staff)):
    results = []
    for cid in req.case_ids[:1000]:
        try:
            if req.action == "assign":
                assert_scope(user, "staff.moderator")
                assign_case(cid, req.payload["moderator_id"], user.id)
            elif req.action == "escalate":
                escalate_case(cid, user.id)
            elif req.action == "dismiss":
                dismiss_case(cid, user.id, note=req.reason_note)
            elif req.action == "apply_enforcement":
                apply_decision(cid, req.payload["decision"], user.id, req.payload.get("payload", {}))
            else:
                raise HTTPException(400, "unknown_action")
            results.append({"case_id": cid, "ok": True})
        except Exception as e:
            results.append({"case_id": cid, "ok": False, "error": str(e)})
    return {"results": results}
```

## 8) Safety & Integrity

Every mutation writes mod_audit row.

Idempotent operations: repeat assign with same moderator is no-op.

Campus scope enforced at query level (WHERE campus_id IN (…)).

PII minimization in exports (no reporter emails by default; admin can include via explicit flag).

## 9) Observability

Metrics:

- mod_admin_requests_total{route}, mod_batch_actions_total{action},
- mod_dashboard_build_ms, mod_csv_exports_total,
- mod_case_list_latency_ms.

Logs: include filter hash, row counts, cursor span.

## 10) Failure Modes

CSV export > 50k rows → require narrower filters (400).

Dashboard cache miss burst → protect with singleflight lock in Redis.

Long-running queries → 2s statement timeout; return 503 with hint.

## 11) Deliverables

FastAPI routes (admin_cases.py, admin_audit.py, admin_dashboard.py, admin_export.py).

SQL helpers, caching layer, pagination utilities, and policy for RBAC.
