## Socializing — Phase 3 Summary

Date: 2025-10-23

Phase 3 introduces real-time 1:1 chat transport layered on top of the proximity + social foundation. The scope covers message sequencing, delivery acknowledgements, attachment metadata capture, Socket.IO broadcast mechanics, and foundational frontend UI/SDK hooks. This doc captures the major deliverables, architecture, tests, and gaps to inform subsequent chat feature work.

### Goal

Deliver a low-latency messaging transport between two users with deterministic ordering, per-user delivery state, attachment metadata, and real-time updates over sockets, while scaffolding frontend components and documentation for future UX polish.

### Key Deliverables

- FastAPI REST endpoints for sending messages, listing conversation history, acknowledging delivery progression, and replaying pending outbox messages.
- Chat domain modules covering conversation key canonicalization, attachment normalization, sequence allocation, delivery/outbox helpers, and repository abstraction with asyncpg + in-memory fallback.
- Socket.IO `/chat` namespace that auto-joins `user:{id}` rooms, emits message/echo/delivery events, and relays typing signals.
- Frontend chat library encapsulating Socket.IO client lifecycle, ULID-based client message IDs, and listener registration.
- Chat UI scaffolding (page + components) showing message timelines, send form, and typing indicator stub.
- Documentation refresh: spec, test plan, and OpenAPI definitions for chat transport.

### Architecture Overview

- **Backend**
  - `backend/app/api/chat.py` defines REST surface (`/chat/messages`, `/chat/conversations/{user}/messages|deliveries|outbox`) with auth header support and error normalisation.
  - `backend/app/domain/chat/service.py` orchestrates message persistence, sequence assignment (ULID IDs + `chat_seq` row locks), delivery updates, outbox replay, and socket emissions.
  - `backend/app/domain/chat/{models,schemas}.py` capture domain + API contracts, including attachment metadata and cursor encoding.
  - `backend/app/domain/chat/attachments.py` normalises attachment payloads, validating media types and allocating ULIDs.
  - `backend/app/domain/chat/sockets.py` hosts the `/chat` namespace, maintaining per-sid sessions and helper emitters (`emit_message`, `emit_echo`, `emit_delivery`).
  - Repository abstraction defaults to asyncpg but falls back to an in-memory store when Postgres is unavailable (keeps tests green on Windows CI).
- **Frontend**
  - `frontend/lib/chat.ts` centralises socket connection, event listeners, and ULID generation (`ulidx`).
  - `frontend/components/{ChatWindow,MessageItem,TypingDots}.tsx` scaffold the chat UI, message alignment, and typing indicator animation.
  - `frontend/app/(chat)/[user]/page.tsx` boots the socket client, fetches history from the API, posts new messages, and feeds the window component.
- **Docs**
  - `docs/part1/socializing/phase3-chat-transport/spec.md` outlines IDs, schema, API endpoints, socket semantics, and delivery policy.
  - `docs/part1/socializing/phase3-chat-transport/test_plan.md` enumerates unit/integration/socket/frontend/manual tests.
  - `docs/part1/socializing/phase3-chat-transport/openapi.yml` declares REST contracts for Phase 3 endpoints.

### Important Files

- backend/app/api/chat.py — REST entry points for send/list/ack/outbox.
- backend/app/domain/chat/service.py — Core transport orchestration, in-memory fallback, delivery emitters.
- backend/app/domain/chat/models.py — Conversation/message structures and cursor helpers.
- backend/app/domain/chat/sockets.py — `/chat` namespace + emit helpers.
- backend/app/domain/chat/attachments.py — Attachment metadata validation + ULID assignment.
- frontend/lib/chat.ts — Socket lifecycle + client ULID helper.
- frontend/components/{ChatWindow,MessageItem,TypingDots}.tsx — Chat UI scaffolding.
- frontend/app/(chat)/[user]/page.tsx — Provisional chat page wiring sockets + REST fetches.
- docs/part1/socializing/phase3-chat-transport/{spec.md,test_plan.md,openapi.yml} — Updated documentation set.

### Tests & Status

- Backend pytest remains green (28 passed). Chat repository defaults to asyncpg; in CI without Postgres the in-memory fallback keeps unit coverage functioning.
- Frontend Vitest suite passes (existing proximity/social specs). Chat components are scaffolded; targeted Vitest coverage to be added in a follow-up.
- Socket-IO flows manually verified via smoke script + unit harness; no automated chat socket tests yet.

### Known Gaps & Next Steps

1. **Database migrations** — Need concrete SQL for `chat_conversations`, `chat_messages`, `chat_seq`, and `chat_delivery` tables (currently referenced but not provisioned).
2. **Authentication** — Frontend still uses stubbed UUIDs; integrate with real auth/session provider for headers + socket auth payloads.
3. **Typing indicator** — Wire socket `chat:typing` events to component state; throttle client-side emits while user enters text.
4. **Frontend data fetching** — Add SWR/React Query for history pagination, delivery ack POSTs, and error handling; convert mocked page to server component wrapper.
5. **Tests** — Add Vitest specs for chat helpers/components and backend async tests for sequence contention & delivery ack semantics.
6. **UX polish** — Replace raw UUIDs with display names/avatars, handle attachments, show delivery/read state badges.

### How to Exercise Phase 3

1. Ensure Postgres + Redis running (Docker Compose). Seed chat tables once migrations are added.
2. Start backend (`uvicorn app.main:socket_app --reload`) to expose REST + Socket.IO namespaces.
3. Start frontend (`npm run dev`) and navigate to `/chat/{peerUUID}` with two browser tabs (adjust stubbed SELF_ID/CAMPUS_ID or wire real auth).
4. Send messages between tabs; observe realtime updates, echo messages, and delivery events in the console.
5. Test reconnect flow: refresh recipient tab to trigger outbox replay + `chat:delivered` emission.

---

Phase 3 establishes the transport layer for Divan chat, ready for future work on conversation lists, read receipts, attachment uploads, moderation, and richer UI/UX. Let me know if you need diagrams, sequence charts, or deeper technical notes.
