## Socializing — Phase 1 Summary

Date: 2025-10-23

This document summarizes Phase 1 of the Socializing (Proximity Core) work completed in this repository. It captures what was implemented, the architecture, key files and components, tests added, and next steps.

### Goal

Deliver a Phase 1 implementation for proximity-based socializing on campus: a backend presence and nearby service (FastAPI + Redis + Postgres), a presence Socket.IO namespace, a lightweight Next.js frontend for heartbeats and nearby lists, and test coverage across unit, API, socket, and frontend layers.

### Key Deliverables

- FastAPI backend endpoints: presence heartbeat, presence status, and proximity/nearby API.
- Redis-backed presence store using Geo commands for efficient radius queries and a Redis-based rate limiter.
- Postgres privacy loaders for campus/user visibility and friendship info.
- Socket.IO presence namespace for subscribe/unsubscribe and diff broadcasts.
- Next.js frontend page for proximity UI with heartbeat cadence, geolocation watch, and socket presence subscription.
- Tests: Python unit tests (anti-spoof, rate limiting, privacy, service helpers), API tests, socket tests, and frontend unit tests (Vitest) plus Playwright E2E placeholders.
- Documentation and migrations (SQL) to provision example data for local/dev runs.

### Architecture Overview

- Backend
  - Framework: FastAPI (async) with Prometheus metrics and async Redis/Postgres clients.
  - Presence model: heartbeats stored in Redis hashes and GEO sets, with anti-spoof checks (speed and jump limits) and rate limiting per device/user.
  - Nearby pipeline: GEO search, privacy filtering via Postgres loaders, pagination/cursor helpers, and diff generation for socket broadcasts.
  - Socket namespace `/presence`: handles subscribe/unsubscribe, authenticates via headers/auth payload, and broadcasts diffs to rooms.

- Frontend
  - Framework: Next.js 14 (app router) + React 18.
  - Features: proximity page with radius controls, heartbeat loop adjustable by document visibility, geolocation watch, subscribing to presence via Socket.IO, and applying diffs client-side.
  - Testing: Vitest unit tests for geo helpers and diff application; Playwright is included for future E2E testing (placeholder tests added; run with Playwright runner).

- Infra
  - Local dev scripts and Docker Compose for Postgres and Redis (migrations and seed scripts provided).

### Important Files (high level)

- backend/app/api/proximity.py — Nearby/heartbeat API surface with rate limiting and Prometheus counters.
- backend/app/domain/proximity/service.py — Core nearby query logic (GEO fetch, privacy filtering, pagination).
- backend/app/domain/proximity/anti_spoof.py — Movement plausibility checks.
- backend/app/sockets.py — Socket.IO PresenceNamespace and diff broadcasting.
- infra/migrations/0001_init.sql — DB schema for campuses, users, friendships.
- frontend/app/(proximity)/page.tsx — Client page with heartbeat cadence and socket subscription.
- frontend/lib/{geo,diff,env,socket,types}.ts — Shared client helpers.
- frontend/__tests__/proximity.unit.spec.ts — Vitest unit tests for client logic.

### Tests and Current Status

- Backend: Unit tests added for anti-spoof logic, rate limiting, privacy filtering, and service helpers. API and socket tests are present to validate routes and presence behavior. Some tests stub or monkeypatch DB loaders to avoid requiring a live Postgres in unit runs.
- Frontend: Vitest unit tests run successfully (geo helpers, diff application). Playwright E2E tests are scaffolded but intentionally skipped/placed as placeholders; they should be run with Playwright's runner when a test harness or mocked backend is available.
- CI/Local: The repo includes scripts for running services locally; the frontend required small fixes to package.json and Vitest config to run unit tests reliably in this workspace (these changes were applied during Phase 1 refinement).

### Known Limitations & Caveats

- Playwright E2E tests are intentionally placeholders; full E2E requires installing Playwright browser binaries and either a running backend or a mocked geolocation/presence harness.
- Some backend integration tests rely on monkeypatching Postgres loaders in unit tests; full integration tests against a real DB are still a recommended next step.
- Frontend dependencies were adjusted to avoid unavailable packages; if you rely on a specific UI package, re-add it with the correct package name/version.

### Next Steps (Phase 1 -> Phase 2 planning)

1. Finish and enable Playwright E2E tests: scaffold a test harness (mock backend or seeded dev stack) and add CI steps to run E2E with Playwright browser downloads.
2. Add integration tests against a real Postgres/Redis instance (use Docker Compose for CI) so privacy loaders and cursor pagination are exerciseable in CI.
3. Harden Socket.IO auth and scale tests: simulate multiple subscribers and diffs to validate performance and rate limiting under load.
4. Review and pin frontend dependencies and add a minimal README for dev-run commands (start backend, seed DB, run frontend, run tests).

### How to run the basic dev/test flow (local)

1. Start infra (Postgres + Redis) via Docker Compose (see infra/compose.yaml)
2. Run backend (Poetry or Python venv) and apply migrations + seed data.
3. Start frontend (npm install; npm run dev) and open the proximity page.
4. Run unit tests:
   - Backend: pytest
   - Frontend: npm run test (Vitest)

If you want, I can produce a short README snippet with exact commands for your environment and/or scaffold the missing E2E harness.

---

Summary created based on repository state and recent edits; if you want this moved to another docs path or to include more detail (diagrams, example requests/responses, OpenAPI snippets), tell me where and I will expand it.
