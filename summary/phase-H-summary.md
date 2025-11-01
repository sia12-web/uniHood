# Phase H - Moderation Trust & Reputation

## Highlights
- Introduced the trust and rate-limit v2 pipeline with dedicated services for reputation scoring, velocity detection, and graduated restriction handling across write surfaces.
- Added staff and self-service FastAPI endpoints (`backend/app/moderation/api/reputation.py`, `backend/app/moderation/api/restrictions.py`, `backend/app/moderation/api/self_restrictions.py`, `backend/app/moderation/api/linkage.py`) so moderators can inspect scores, adjust deltas, manage ledger entries, and review abuse linkage clusters.
- Delivered new domain modules (`backend/app/moderation/domain/reputation.py`, `backend/app/moderation/domain/velocity.py`, `backend/app/moderation/domain/restrictions.py`, `backend/app/moderation/domain/linkage.py`, `backend/app/moderation/domain/ip_enrichment.py`) plus middleware `write_gate_v2` to enforce cooldowns, shadow restrictions, captcha requirements, and honey-action traps.
- Created migrations `0240_mod_device.sql` through `0245_mod_linkage.sql` establishing persistence for devices, IP reputation, user reputation, restriction ledger, and linkage clusters, alongside background jobs for decay, enrichment, and clean-up.
- Expanded observability with Prometheus metrics for velocity trips, restriction counts, reputation band observations, honey trips, shadow writes, and captcha requirements.

## Testing
- Targeted unit flows via `python -m pytest backend/tests/unit/test_moderation_thresholds.py` (existing suite). New modules provide in-memory repositories enabling future coverage.

## Operations
- Apply migrations `0240_mod_device.sql` to `0245_mod_linkage.sql` before enabling the write gate v2 middleware.
- Configure Redis durability for the new cooldown, shadow, captcha, honey, and velocity keys (`rl:*`, `cooldown:*`, `shadow:*`, `captcha:*`, `honey:trip:*`).

## Follow-ups
- Implement Postgres-backed repositories for reputation, restrictions, linkage, and IP reputation, wiring them through the moderation container for production use.
- Extend automated coverage for velocity windows, honey-action detection, and the moderation write gate once dependencies are wired into API endpoints.
- Integrate captcha provider plumbing and synchronize reputation adjustments with Phase 1 trust scores to avoid drift.
