## Socializing — Phase 2 Summary

Date: 2025-10-23

Phase 2 extends the Socializing feature set beyond proximity by layering in directional invites, a symmetric friendship graph, block management, audit instrumentation, and basic UI surfaces for managing these interactions. This document highlights the major deliverables, architectural pieces, tests, and follow-up work added during this phase.

### Goal

Deliver invite and friendship workflows on top of the Phase 1 proximity core, covering outbound invite creation, acceptance/decline/cancel paths, friendship state, block/unblock enforcement, rate limiting, audit streams, and real-time updates via Socket.IO alongside minimal frontend surfaces to exercise the flows.

### Key Deliverables

- FastAPI REST endpoints for invites (`/invites/send`, accept/decline/cancel, inbox/outbox) and friendships (`/friends/list`, block/unblock).
- Domain service/policy modules implementing auto-accept mutual invites, dedupe, rate limits, block assertions, friendship upserts, and Redis-backed counters.
- Social Socket.IO namespace (`/social`) with per-user rooms delivering `invite:new`, `invite:update`, and `friend:update` events.
- Postgres migration (`infra/migrations/0002_social.sql`) defining `invitations` and `friendships` tables with supporting indexes/triggers.
- Audit helpers emitting Prometheus metrics and Redis stream events for invites/friendships.
- Frontend invite/friend management pages plus updated proximity list with an inline "Invite" action wired to the new REST/socket flows.
- Vitest component coverage for the new UI widgets (`InviteInbox`, `FriendList`).

### Architecture Overview

- **Backend**
  - `backend/app/api/social.py` exposes REST endpoints and maps domain exceptions to HTTP semantics (409 vs 403 vs 404) while incrementing audit counters.
  - `backend/app/domain/social/` contains policy checks (rate limits, block/friend guards), service orchestration (auto-accept, invite cancellation, symmetric friendship updates), audit logging, and socket emitters.
  - Socket namespace (`SocialNamespace`) automatically rooms users and broadcasts invite/friend updates to both participants.
  - Redis enforces invite/block rate limits and records events; Prometheus counters track send/accept/block actions.

- **Frontend**
  - `frontend/app/(social)/invites/page.tsx` fetches inbox/outbox, wires accept/decline/cancel actions, and refreshes lists on socket events.
  - `frontend/app/(social)/friends/page.tsx` surfaces accepted/blocked/pending filters with block/unblock controls tied to REST and real-time updates.
  - `frontend/components/InviteInbox.tsx` and `frontend/components/FriendList.tsx` render actionable lists with semantic HTML and Tailwind styling.
  - `frontend/app/(proximity)/page.tsx` now exposes an `Invite` button per nearby user, calling `sendInvite`; accepted invites flip the UI into a friend state.
  - Shared helpers in `frontend/lib/social.ts` wrap invite/friend REST calls; `frontend/lib/socket.ts` now provides a cached `/social` client.

- **Infra & Data**
  - `infra/migrations/0002_social.sql` adds relational schema, indexes, expiration triggers, and block-focused constraints.
  - Docker Compose continues to supply Postgres/Redis for local testing; no changes required to spin up Phase 2.

### Important Files (high level)

- backend/app/api/social.py — REST surface for invites/friends with exception mapping.
- backend/app/domain/social/service.py — Core invite/friendship orchestration (send/accept/decline/cancel/block/unblock).
- backend/app/domain/social/policy.py — Guards for rate limits, dedupe, block enforcement, and DB lookups.
- backend/app/domain/social/sockets.py — `/social` namespace configuration and emit helpers.
- backend/app/domain/social/audit.py — Prometheus counters + Redis stream appenders.
- infra/migrations/0002_social.sql — Invitations/friendships tables, indexes, and expiry triggers.
- frontend/app/(proximity)/page.tsx — Proximity UI with invite action and heartbeat loop.
- frontend/components/{InviteInbox,FriendList}.tsx — Reusable Phase 2 UI components.
- frontend/app/(social)/{invites,friends}/page.tsx — Phase 2 pages consuming REST/socket helpers.
- frontend/__tests__/social.components.spec.tsx — Vitest coverage for InviteInbox/FriendList behavior.

### Tests and Current Status

- Backend: Unit coverage for policy boundary conditions and rate limiting (`backend/tests/unit/test_social_policy.py`), plus API contract tests for success and failure paths (`backend/tests/api/test_social_invites.py`).
- Frontend: Vitest suite now exercises social components (`npm run test` passes) alongside existing proximity unit tests; Playwright specs remain scaffolded but skipped pending a full E2E harness.
- Local command checks:
  - Backend: `poetry run pytest backend/tests` (or equivalent venv invocation).
  - Frontend: `npm run test` (Vitest) and `npm run test:e2e` (Playwright, when enabled).
  - Socket-driven flows validated via unit/API tests and manual exercise through the updated pages.

### Known Limitations & Caveats

- Frontend pages operate against demo user/campus IDs pulled from env defaults; authentication and richer user profiles are stubbed.
- Invite/Friend UIs display raw UUIDs pending integration with a user directory/Phase 3 profile enrichment.
- Real-time updates trigger full list refreshes; optimistic list reconciliation is deferred.
- Playwright E2E coverage for invites/friends is not yet implemented; sockets are untested end-to-end in CI.
- Rate-limit feedback is surfaced as error banners; no fine-grained UI for showing remaining quota.

### Next Steps (Phase 2 → Phase 3 planning)

1. Integrate user profile lookups so invite/friend lists render display names/avatars instead of UUIDs.
2. Extend frontend with optimistic state updates and toast notifications for socket events.
3. Implement Playwright E2E flows covering invite send/accept/block scenarios against a seeded stack.
4. Wire real authentication/session context so demo IDs are replaced with real users; update policy guards accordingly.
5. Add background jobs to expire invites and emit `invite:update`/metrics automatically.

### How to Exercise Phase 2 Locally

1. Ensure Postgres + Redis are running (e.g., `docker compose up` in `infra/docker`).
2. Apply migrations (`poetry run alembic upgrade head` or project-specific migration tooling).
3. Start the backend API (`poetry run uvicorn app.main:app --reload`).
4. Start the frontend (`npm install`, then `npm run dev`) and navigate to `/social/invites`, `/social/friends`, and the dashboard (`/`) for the live radar card.
5. Use the dashboard proximity list to send invites; observe inbox/outbox updates, friendship transitions, and block/unblock flows updating in real-time.

---

Phase 2 now supplies end-to-end invite and friendship management on top of the proximity core. If further documentation or diagrams are needed, let me know where to extend this summary.
