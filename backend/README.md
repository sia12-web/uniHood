# Divan Backend – Phase 1: Proximity Core

This service provides real-time presence, proximity lookup, and social discovery for campus users.

- FastAPI, Redis GEO/Streams, Socket.IO (ASGI)
- Phase 7 search & discovery endpoints: `/search/users`, `/discover/people`, `/discover/rooms`
- Phase 8 observability: `/health/*`, `/metrics`, `/ops/trace/test`, `/ops/rollover` with optional OTLP export
- Phase 4 moderation: `/api/mod/v1/*` (reports, cases, policies, audit) with Redis-backed workers and migrations `infra/migrations/0200_mod_policy.sql` → `0205_user_rate_limit.sql`
- Phase 4 safety scanning: asynchronous media/text/url scanners powered by Redis Streams (`scan:*`), configurable via `config/moderation.yml`, with migrations `parts/04-moderation/backend/phase-4-safety-scanning/migrations/0230_*.sql`
- Apply `infra/migrations/0005_search.sql` to install trigram indexes for user/room lookups
- See `docs/part1/socializing/phase1-proximity-core/spec.md`, `docs/part1/socializing/phase7-search-discovery/spec.md`, and `docs/part1/socializing/phase8-observability-ops/spec.md`

## Local commands

- Run API tests: `python -m pytest -q`
- Run moderation unit tests: `$env:PYTHONPATH="%CD%"; C:/Users/shahb/anaconda3/Scripts/conda.exe run -p C:/Users/shahb/anaconda3 pytest tests/unit/test_moderation_detectors.py tests/unit/test_moderation_gates.py tests/unit/test_moderation_policy_engine.py`
- Run communities integration tests (requires Docker):
	- `$env:PYTHONPATH="%CD%"; C:/Users/shahb/anaconda3/Scripts/conda.exe run -p C:\Users\shahb\anaconda3 --no-capture-output pytest tests/integration/test_communities_repo.py`
- Provision communities search templates (OpenSearch bootstrap stub): `python -m scripts.search_bootstrap`
- Refresh moderation safety thresholds after edits: `python -c "from app.moderation.domain import container; container.configure_thresholds_from_file('config/moderation.yml')"`
- Reputation gating defaults (velocity windows, TTLs) live in `config/moderation_reputation.yml`; edit and restart to apply.
- Validate Prometheus alerts: `docker run --rm -v %CD%\..\infra\prometheus:/work --entrypoint /bin/promtool prom/prometheus:v2.54.1 check rules /work/rules-phase8.yml`
- Smoke the k6 scenarios (dry run skips HTTP calls):
	- `docker run --rm -e K6_DRY_RUN=1 -v %CD%\..\infra\k6:/scripts grafana/k6 run --vus 1 --duration 3s /scripts/chat_send_load.js`
	- `docker run --rm -e K6_DRY_RUN=1 -v %CD%\..\infra\k6:/scripts grafana/k6 run --vus 1 --duration 3s /scripts/proximity_nearby_load.js`
- Verify a freshly registered user and set their password: `python scripts/verify_account.py <email> <password>`
- Anonymize & delete a user by email/username (clears sessions, audit updated): `python scripts/delete_account.py <email> <username>`

### Database migrations

- Apply all SQL migrations locally (Postgres exposed on localhost:5432): `python scripts/apply_migrations.py`
- If a later moderation migration fails (e.g., at `0240_mod_device.sql`) but you need the profile fields now used by proximity (major, graduation_year, passions), apply just those columns: `python scripts/apply_profile_details.py`

### Feature toggles

- `COMMUNITIES_WORKERS_ENABLED=true` – launch the communities outbox indexer and Redis stream emitter alongside the FastAPI app.
- `MODERATION_WORKERS_ENABLED=true` – spawn the moderation ingress and actions workers (Redis Streams based).
