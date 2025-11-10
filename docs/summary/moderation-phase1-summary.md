## Moderation — Phase 1 Summary

Date: 2025-10-29

Phase 1 introduces the moderation foundation into the production backend: policy-driven enforcement, trust scoring, Redis stream workers, and staff-facing APIs for reports, cases, policies, and audit trails. The work lifts the prototype assets from `parts/04-moderation` into the live FastAPI app, wires configuration into startup, and ships schema support so moderation data can persist in Postgres.

### Goal

Deliver the first moderation slice that can ingest user reports and automated signals, evaluate policies, persist cases/actions/audit records, expose staff APIs, and run background workers to process Redis streams while keeping local development friendly via in-memory defaults.

### Key Deliverables

- Production-ready moderation package under `backend/app/moderation/**` covering API routers, domain services, policy engine, detectors, trust ledger, Postgres/Redis infrastructure, and worker runtime helpers.
- FastAPI integration in `backend/app/main.py` that configures moderation with the asyncpg pool, registers the router namespace, and conditionally spawns ingress/actions workers controlled by `MODERATION_WORKERS_ENABLED`.
- New SQL migrations (`infra/migrations/0200_mod_policy.sql` → `0205_user_rate_limit.sql`) establishing policy, case, action, audit, trust, and rate limit tables required by the repositories.
- Unit coverage for detectors, gates, and policy evaluation via `tests/unit/test_moderation_detectors.py`, `test_moderation_gates.py`, and `test_moderation_policy_engine.py`.
- Repository documentation updates in `backend/README.md` outlining moderation endpoints, migrations, worker toggle, and the targeted pytest command.

### Architecture Overview

- **Domain Core**
  - `app.moderation.domain.container` manages injectable singletons (repository, trust ledger, detectors) with `configure_postgres` to bind asyncpg/Redis instances in production while defaulting to in-memory stubs for tests.
  - `app.moderation.domain.policy_engine` and detectors (`detectors/*.py`) evaluate signals, with `ModerationEnforcer` coordinating persistence and enforcement hooks.
  - `app.moderation.domain.gates` supplies request guards that consult trust scores, rate limits, and mute state prior to content creation.
- **Infrastructure**
  - `infra/postgres_repo.py` and `infra/trust_repo.py` persist cases/actions/audit logs and trust scores using asyncpg; `infra/redis.py` wraps Redis streams and rate counters compatible with decode-responses clients.
  - `infra/rate_limit.py` offers a Redis-backed limiter used by moderation gates.
- **Workers & APIs**
  - `workers/ingress_worker.py` evaluates incoming moderation events, applies policy decisions, and emits downstream actions; `workers/actions_worker.py` performs audit logging for enforced decisions; `workers/runner.py` exposes `spawn_workers` for startup wiring.
  - API routers in `api/{reports,cases,policies,audit}.py` expose staff endpoints under `/api/mod/v1/*`, aggregated via `api/__init__.py` and surfaced to the app through `app.moderation.router`.

### Tests & Status

- `$env:PYTHONPATH="C:/Users/shahb/OneDrive/Desktop/Divan/backend"; C:/Users/shahb/anaconda3/Scripts/conda.exe run -p C:/Users/shahb/anaconda3 pytest tests/unit/test_moderation_detectors.py tests/unit/test_moderation_gates.py tests/unit/test_moderation_policy_engine.py`
  - All 11 moderation unit tests pass locally in the configured Conda environment (pytest-8.4.2, asyncio plugin in strict mode).

### Follow-Ups

Completed on 2025-11-10:
- Migrations `0200`–`0205` are covered by the primary runbook (`scripts/apply_migrations.py`) and applied to shared Postgres; no further action required.
- Communities enforcement hooks now wire warnings to notifications and restrict-create to the restriction ledger, matching Phase 1 policy expectations.
- Redis stream workers (`mod:ingress`/`mod:decisions`) carry integration coverage via `backend/tests/redis_integration/test_moderation_workers.py` alongside existing unit suites.
