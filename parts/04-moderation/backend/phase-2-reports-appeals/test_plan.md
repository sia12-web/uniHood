# Test Plan — Moderation · Backend Phase 2 — Reports, Appeals & Case Workflow

## 0) Scope
Validate reports, case state transitions, appeals intake and resolution, trust adjustments, and audit logging.

## 1) Unit Tests
- `assign_case` updates `assigned_to` and emits an audit row.
- `submit_appeal` inserts `mod_appeal`, toggles `appeal_open`, and writes to the appeals stream.
- `resolve_appeal` closes the case, updates appeal status, and calls `revert_enforcement` on acceptance.
- `trust_update` adjusts scores for reporters and appellants based on outcomes.

## 2) Integration Tests
- `POST /reports`
  - Creates a new `mod_case` when none exists.
  - Duplicate reports (same `reporter_id` + subject) return HTTP 409.
  - Emits payloads to `mod:reports`.
- `POST /appeals`
  - Forbidden when the subject does not belong to the caller.
  - Creates a `mod_appeal` row and sets `appeal_open`.
  - Re-posting against the same case yields HTTP 409.
- `POST /appeals/{id}/resolve`
  - Requires `staff.admin` scope, sets `reviewed_by/at`, updates case to `closed`.
  - Accepted → enforcement reversal triggered; rejected → no change to enforcement.
- `POST /cases/{id}/assign|escalate|dismiss|actions`
  - Update case fields appropriately and record audit rows.

## 3) End-to-End Scenario
1. User A reports a post authored by User B → case enters `open` state.
2. Moderator assigns the case, escalates, and performs an enforcement action → `actioned`.
3. User B appeals; admin resolves as accepted → content restored and case `closed`.
4. Audit log shows complete lifecycle trace.
5. Reporter trust increases, appellant trust updated per outcome.

## 4) Performance Targets
- Report → case processing latency under 100 ms on average.
- Appeals queue throughput ≥ 200 events/second; notification latency under 1 second.

## 5) Resilience Expectations
- Redis downtime does not drop events; worker replays once available.
- Appeal submission remains idempotent via unique constraints.
- Duplicate assignment or resolve requests do not crash or corrupt state.

## 6) Security Checks
- Only the case subject owner can appeal.
- Staff endpoints enforce JWT scopes (`staff.moderator`, `staff.admin`).
- Notes are encrypted at rest and masked in logs when necessary.

## 7) Coverage Targets
- ≥ 85% coverage for API logic.
- ≥ 80% coverage for worker modules.
- ≥ 75% coverage across integration tests.
