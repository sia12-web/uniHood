# Phase 1 – Proximity Core Test Plan

## 1. Scope
- Proximity API (`/presence/heartbeat`, `/presence/status/self`, `/proximity/nearby`)
- Redis presence lifecycle, rate limiting, anti-spoofing rules
- Privacy enforcement and distance blurring logic
- Socket namespace join/leave semantics (smoke validation)
- Frontend heartbeat loop, socket subscription, rendering (unit + integration harness)

## 2. Test Matrix
- **Unit**
	- `test_anti_spoof.py`: speed cap, jump rejection, happy path
	- `test_privacy.py`: visibility permutations, ghost mode override
	- `test_rate_limit.py`: bucket accounting, exhaustion rejection
	- `test_service_bucket.py`: rounding helper edge cases
	- `frontend/__tests__/proximity.unit.spec.ts`: React heartbeat hook, diff reducer, distance badge formatting (Vitest + RTL)
- **API (async FastAPI + FakeRedis)**
	- `test_presence_heartbeat.py`: success path, campus mismatch 403, TTL persistence
	- `test_presence_status_self.py`: online/offline responses
	- `test_proximity_nearby.py`: privacy + friendship filtering, distance blur, cursor absence
- **Sockets**
	- `backend/tests/sockets/test_presence_namespace.py`: namespace handshake, subscribe/unsubscribe rooms, diff payload structure (uses python-socketio test client + fake redis)
- **Redis integration**
	- `backend/tests/redis_integration/test_geo_flow.py`: geo index round-trip, TTL expiry > removal
	- `backend/tests/redis_integration/test_streams.py`: heartbeat + nearby analytics stream writes trimmed
- **Frontend E2E**
	- `frontend/__tests__/proximity.e2e.spec.ts`: Playwright scenario covering heartbeat cadence, radius change, hidden tab back-off, presence expiry

## 3. Tooling & Commands
- Backend: `poetry install` then `poetry run pytest`
- Frontend: `npm install` then `npm run test` (Vitest) and `npx playwright test`
- Docker harness: `docker compose -f infra/docker/compose.yaml up --build`

## 4. Data Fixtures
- Seed script `scripts/seed_phase1.sh` creates campuses, demo users, friendships for local testing
- Tests rely on fakeredis + monkeypatched repositories (no live Postgres)
- Playwright uses mocked geolocation coordinates (env `PLAYWRIGHT_GEO_FIXTURE`)

## 5. Coverage Targets
- ≥ 85% line coverage backend proximity modules
- 100% of critical paths: rate limiting, anti-spoofing fail branches, privacy filters
- Frontend: snapshot + behavioural coverage for list diffs and heartbeat scheduler

## 6. Open Risks
- Real Postgres integration untested (requires docker services)
- Socket diff algorithm needs stress tests once backend fanout implemented fully
- Mobile WebKit geolocation throttling requires manual QA on devices
