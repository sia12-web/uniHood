# Test Plan — Moderation · Backend Phase 3 — Admin Console & Dashboard API

## 0) Scope
Covers staff case list/search/sort, detail, batch actions, audit list, dashboards, exports, RBAC, and performance.

## 1) Unit
- **Filters builder**: combinations of status/severity/assigned/campus/time produce correct SQL + params.
- **Keyset cursor**: encode/decode; stable across pages; boundary tests.
- **RBAC guard**: moderator scoped to campuses; admin allowed all.
- **Cache layer**: dashboard cache set/get; TTL honored; singleflight prevents thundering herd.

## 2) Integration (API)
- **Cases list**
  - Filters: status=open; assigned=none; severity range; subject_type multi; appeal_open true.
  - Search `q` matches `subject_id` and (if enabled) `meta.subject_text`.
  - Sort combinations; pagination with `after`; no duplicates between pages.
- **Case detail**
  - Returns case + last action + reporters (count) + appeal status.
- **Batch actions**
  - assign → audit row; escalate increments level; dismiss sets status; apply_enforcement calls Phase1 enforcement.
  - Partial failure returns per-id errors.
- **Audit viewer**
  - Filters by target_id/time; pagination works.
- **Dashboards**
  - KPIs & trends return correct aggregates (seeded data).
  - Workload shows counts per severity; SLA breaches flagged.
- **CSV export**
  - Filtered export streams rows; header presence; limits enforced.

## 3) Security
- 401 without staff token; 403 for moderator outside campus scope.
- Rate limits: exceed → 429; CSV export > 1/min → 429.
- Export redacts reporter PII unless `include_reporter=1` and `staff.admin`.

## 4) Performance
- List query p95 < 120 ms for 100k case table (indexed).
- Dashboard build < 300 ms (cache hit < 5 ms).
- CSV stream > 20k rows/min.

## 5) Resilience
- Statement timeout triggers retry with looser sort (drop secondary order) and returns 206-like partial hint.
- Cache backend down → compute fresh, log warn.

## 6) E2E (happy path)
1. Moderator lists open cases at their campus; sorts by severity desc; pages twice.  
2. Select 10 cases → batch `assign` to self; verify audit.  
3. Admin views trends; exports CSV for last 24h; file starts streaming.  
4. Moderator escalates a case; workload widget reflects increase.  

## 7) Coverage Targets
- ≥ 85%: filters/pagination/RBAC utilities.
- ≥ 80%: routes/batch/export.
- ≥ 75%: dashboard aggregations.
