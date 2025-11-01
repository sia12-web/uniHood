# Moderation · Backend Phase 1 — Policy Engine & Audit Log

This phase introduces the core moderation services described in the spec:

- PostgreSQL schema migrations for policies, cases, actions, audit log, trust scores, and rate limits.
- FastAPI endpoints for report intake, case retrieval, policy dry-run, and audit browsing under `/api/mod/v1`.
- Domain modules for policy evaluation, enforcement wiring, trust ledger, request gates, and detector implementations (profanity, duplicate text, velocity, link safety, NSFW stub).
- Worker blueprints for ingress processing, action execution, and trust score updates, backed by Redis stream helpers and rate limiting utilities.
- Postgres/Redis adapters exposed via `app/moderation/domain/container.configure_postgres` so the phase can run against real infrastructure while tests default to in-memory adapters.
- Pytest coverage scaffolding under `parts/04-moderation/backend/phase-1-policy-engine-audit/tests/` covering policy evaluation, detectors, and request gates.
- Worker runner (`app/moderation/workers/runner.py`) that spawns the ingress/actions loops on an event loop for scheduler integration.

Components default to in-memory adapters for fast iteration, but `configure_postgres` lets deployments supply real asyncpg/Redis clients without touching the API surface.
