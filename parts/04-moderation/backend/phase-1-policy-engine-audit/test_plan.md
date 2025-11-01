# Moderation · Backend Phase 1 — Policy Engine & Audit Log · Test Plan

## 0) Scope
Unit, integration, and E2E tests for detectors, evaluator, enforcement, reports, audit, trust, and request gates.

## 1) Unit
- **Detectors**
  - Profanity levels map correctly; leet/asterisk variants matched.
  - Duplicate text flag triggers after N similar posts in 5m.
  - Velocity thresholds scale with trust.
- **Evaluator**
  - No matches → default action; multiple matches → highest severity picked.
  - `user.trust_below` predicate blocks when score < threshold.
- **Trust updater**
  - Positive/negative deltas accumulate with caps; never <0 or >100.

## 2) Integration
- **Ingress → Decision → Action**
  - XADD `mod:ingress` with post → decision `tombstone` writes `mod_case`, `mod_action`, emits `mod:decisions`, applies enforcement (DB flag).
  - Idempotency: reprocessing same event_id does not duplicate actions.
- **Reports**
  - `POST /reports` creates/updates case; audit row written; ingress message emitted.
- **Audit**
  - Every evaluation & action inserts `mod_audit` with proper meta.
- **Gates**
  - Low trust + velocity → `429 account_limited` on post create.
  - Muted user → `403 muted_until`.

## 3) Staff APIs (auth mocked)
- `GET /cases/{id}` returns case with last decision & actions.
- `POST /policies/dry_run` returns decision without side effects.

## 4) E2E (happy paths)
1. User posts with profanity → auto tombstone; author can see, others cannot; audit records.  
2. Multiple duplicate posts → shadow_hide decision; trust decreases.  
3. User reports a comment → case opened; moderator sees case.  
4. Low-trust user hitting velocity → restricted_create for 60 min.

## 5) Performance
- Evaluator p95 < 10 ms per event (text-only).  
- Ingress worker handles 500 events/s with 4 workers.  
- Audit writes are batched (COPY or multi-row insert) under load.

## 6) Resilience
- Redis outage: worker resumes from last ID; DLQ for failed actions non-zero triggers alert.
- Detector exceptions do not crash worker; logged and skipped.

## 7) Coverage Targets
- ≥ 85% detectors/evaluator; ≥ 80% workers/enforcement; ≥ 75% API.
