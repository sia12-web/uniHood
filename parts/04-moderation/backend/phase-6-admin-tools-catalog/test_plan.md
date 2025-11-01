# Moderation · Backend Phase 6 — Admin Tools & Actions Catalog · Test Plan

## 0) Scope
Validate catalog CRUD, macro simulate/execute, batch revert/unshadow, bundle import/export, safety rails, and RBAC.

## 1) Unit
- Catalog validation: unknown action keys, guard schema, variable interpolation, version collisions.
- Guard predicates: `user.band_in`, `subject.is_public`, `case.status_in`, `subject.created_within`.
- Revertors: restore soft-deleted content; revoke restrictions; clear shadow flags.
- Simulator: produces deterministic plans; respects guards and variables.

## 2) Integration
- Create catalog entries (admin) and list active.
- Run macro (dry-run) on case selector → returns plan with step counts; execute with sample=10 → updates `mod_batch_job` and writes `mod_action` & `mod_audit`.
- Batch unshadow: query selector finds shadowed posts; clears flags; search reindexed; audit entries present.
- Batch revert: revert remove + restrict; content restored; restrictions revoked.
- Bundle import: dry-run produces diff (created/updated/unchanged); enabling persists new versions, deactivates old ones if requested.

## 3) RBAC & Safety
- Moderator cannot create/deactivate catalog; cannot run revert/unshadow.
- Admin can, but must perform dry-run first; executing without prior dry-run returns 400.
- Campus scoping enforced for moderator-run macros.

## 4) End-to-End
1. Admin imports bundle with `spam_sweep@2`; dry-run ok; enable.
2. Moderator runs `spam_sweep@2` on 500 cases with sample=20 → success; job completes; partial failures logged.
3. Admin runs batch unshadow for a campus — 120 posts restored; metrics updated.
4. Admin batch revert of `restrict_create` on 40 users → ledger cleared; users can post again.

## 5) Performance
- Worker processes ≥ 50 items/s with DB batching; backpressure via queue size.
- Export streams YAML; import parses 10k actions in under 2s (chunked).

## 6) Observability
- Metrics counters increment correctly; audit includes `job_id`; failed items recorded.

## 7) Coverage Targets
- ≥ 85% catalog + guards + revertors; ≥ 80% API; ≥ 75% worker paths.
