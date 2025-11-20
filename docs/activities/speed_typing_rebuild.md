# Speed Typing Rebuild Plan (WIP)

_Last updated: 2025-11-17_

## 1. Requirements & Current Behavior Inventory

### Session lifecycle (from `services/activities-core/src/services/speedTyping.ts`)
- Phases: `lobby` ➜ `countdown` ➜ `running`; lobby readiness gates countdown (all presence `joined && ready`).
- Countdown defaults to 5s (`LOBBY_COUNTDOWN_MS`), cancellable if any player un-readies (emits `activity.session.presence`).
- Running phase tracks `totalRounds` from `SpeedTypingConfig.rounds` (env-overridable) and `roundDeadlines` per round.
- Submissions saved per `[round][userId]` snapshot with metrics, incidents, event publishing, and scheduler timers.
- Timers scheduled through `TimerScheduler` to auto-close rounds when `timeLimitMs` elapses; listeners call `handleTimerElapsed` ➜ marks round complete, advances or ends session, publishes scoreboard updates, clears Redis state on completion.

### Anti-cheat & telemetry
- `recordKeystroke` collects `KeystrokeSample` arrays per round for each user, merging incidents via `mergeIncidentTypes` from `lib/antiCheat`.
- `updateSkewEstimate` tracks client/server clock skew for fairness and integrates `normalizeClientTime` when accepting submissions.
- Incidents stored in Redis state and flushed into Prisma `incident` / `submission` tables on finalize.

### Persistence & cache
- Session state cached in Redis (`sess:${sessionId}:state`); authoritative scoreboard persisted via Prisma `submission` + `session` updates.
- Creation ensures `activity` row exists (`ensureActivity`), participants pre-inserted, and lobby presence map seeded from `participants`.

### API surface expectations (`sessionRoutes.ts`)
- REST endpoints: `/activities/session` create, `/activities/session/:id/start|join|leave|ready` lifecycle, `/activities/session/:id` snapshot, `/activities/sessions` listing.
- Auth plugin may infer dev identity from headers/body when `ALLOW_INSECURE_BEARER` or `NODE_ENV=development`.
- Speed typing service must implement: `createSession`, `startSession`, `submitRound`, `handleTimerElapsed`, `joinSession`, `leaveSession`, `setReady`, `recordKeystroke`, `updateSkewEstimate`, plus new `listSessionsForUser` used by list route.

### Frontend expectations (`frontend/app/activities/speed_typing/page.tsx`, `features/activities/api/client.ts`)
- UI uses legacy session APIs: create session with `participants`, start via `/activities/session/:id/start`, fetch prompts via `/activities/session/:id` + websockets (panel/hook), scoreboard mini component expects `participants` with `score`.
- Additional Next.js components/hook (`SpeedTypingPanel`, `useSpeedTypingSession`) rely on websocket stream delivering presence, countdown, scoreboard events.
- Newer Activity APIs (`/activities/*` FastAPI) co-exist; rebuild likely needs compatibility or migration path.

### Config / toggles
- Env overrides: `SPEED_TYPING_ROUNDS`, `SPEED_TYPING_TIME_LIMIT_MS`, `SPEED_TYPING_TEXT_MIN/MAX`.
- Ops toggles already in scripts: `SPEED_TYPING_FORCE_SINGLE_ROUND`, `DISABLE_DEMO_USER` (frontend) – ensure new design respects or replaces them.

## 2. Known Gaps / Pain Points
- Countdown/phase desyncs observed when lobby presence flaps; rebuild should harden presence tracking.
- Need richer logging hooks for lifecycle + per-round metrics (current publisher events limited to `activity.session.*`).
- Need first-party support for single-round overrides + deterministic test fixtures for prompts/text samples.
- Desire to unify with new `/activities/*` API model without breaking existing tests.

## 3. Next Steps
1. Draft backend redesign covering: lobby coordination, deterministic prompt service, timer wheel, scoring pipeline, incident review hooks.
2. Map websocket payload contract for new frontend (maybe SSE fallback) and align with `LiveSessionShell` expectations.
3. Produce migration/testing plan (integration tests in `services/activities-core/tests/ws`, frontend Playwright).

_(Sections 2–3 will be expanded in subsequent steps.)_

## 4. Backend redesign (draft)

### Goals
- Keep lobby experience compatible with legacy `/activities/session/*` routes while internally modeling sessions as deterministic state machines that can later back the `/activities/*` API.
- Make timers resilient (single scheduler per session, resumable from Redis) so crashes do not leave rounds stuck.
- Capture anti-cheat data as first-class artifacts (keystrokes + incidents streamed via event bus) for later review tooling.

### Architecture overview
1. **State container**: Redis hash `speed:${sessionId}` storing JSON blob with:
	- `phase`, `roundIndex`, `roundEndsAt`, `promptId`, `submissions`, `presence`, `skew`, `incidents`.
	- `timerToken` (UUID) to dedupe delayed timer callbacks after restarts.
2. **Scheduler**: replace `TimerScheduler` single-shot with queue-backed worker:
	- `scheduleRoundClose(sessionId, roundIdx, deadlineMs)` stores item in Redis sorted set (`speed:timers`).
	- Background worker (same process) polls zset every 250ms; when due it loads state, checks `timerToken`, and calls `advanceRound` idempotently.
	- Enables horizontal scale (only one worker takes ownership via `SETNX speed:locks:${sessionId}`).
3. **Prompt service**: deterministic bank keyed by `promptId` so front/back share the same text.
	- Extend `lib/textBank.ts` to expose `getPromptById(id)` and `allocatePrompt(lenRange)` that records `(sessionId, roundIdx)` mapping for audits.
4. **Submission pipeline**:
	- `submitRound` validates payload, normalizes timestamps via skew table, generates `TypingMetricsV2`, and writes `SubmissionSnapshot` to Redis.
	- When both participants have submitted _or_ deadline hits, `finalizeRound` persists Prisma `submission` rows, publishes `activity.session.scoreboard`, and primes next round prompt.
5. **Presence & readiness**:
	- Presence map stores `joined`, `ready`, `lastHeartbeatAt`; `joinSession` flips `joined=true` and emits presence.
	- Countdown enters `countdown` phase only when `allReady()` and `phase==='lobby'`; un-ready cancels countdown and clears timer entry.
6. **Anti-cheat stream**:
	- `recordKeystroke` writes to Redis stream `speed:keystrokes:${sessionId}` with payload `{ round, userId, len, paste }` and also updates in-memory incidents.
	- Batch job (or same service) consumes stream to persist suspicious patterns asynchronously.

### API surface & compatibility
- Keep existing service interface but add:
  - `listSessionsForUser({ userId, statuses })` now queries Prisma `session` table filtered by `activityKey='speed_typing'` and derives `phase` from cached state.
  - `getPrompt(sessionId, roundIdx)` internal helper used by websocket publisher + future REST route.
- Plan to expose new REST endpoints behind feature flag:
  - `GET /activities/session/:id/round/:idx/prompt` returning `{ prompt, roundIdx, deadlineMs }`.
  - `POST /activities/session/:id/round/:idx/submit` to mirror eventual `/activities/typing/submissions` contract.

### Data model adjustments
- Prisma: add `prompt_id` + `text_len` columns to `submission`, `session_round` tables for replayability.
- Redis key TTL: set 6h TTL on state hashes once session ends; incidents moved to Prisma for long-term storage.

### Observability
- Emit `activity.session.lifecycle` events for `lobby_ready`, `countdown_started/cancelled`, `round_started`, `round_closed`, `session_completed` with metadata: userIds, promptId, deadlines.
- Counter metrics via StatsD/OTel (if available): `speed_typing.round_duration`, `speed_typing.missing_submission`, etc.

### Migration/testing plan (backend scope)
1. Implement new scheduler + state layout behind env flag `SPEED_TYPING_ENGINE=next`.
2. Duplicate existing websocket integration tests (`tests/ws/sessionStream.test.ts`) to run against new engine with deterministic prompts.
3. Provide data backfill script to populate new Prisma columns for recent sessions (best-effort).

_Next draft: map frontend contract + rollout steps (Todo #3)._ 

## 5. Implementation & rollout plan

### Phase 0 — prep (1–2 days)
- [ ] Land deterministic prompt fixtures + helper utilities (can ship ahead of new engine).
- [ ] Add feature flag plumbing (`SPEED_TYPING_ENGINE` env, frontend query param `engine=next`).
- [ ] Stand up dev dashboard (simple CLI or script) to inspect Redis state for a session.

### Phase 1 — backend engine alpha (3–4 days)
1. Implement Redis state container + timer worker guarded by feature flag.
2. Port existing service surface to new internals; maintain integration tests via engine matrix (legacy + next).
3. Emit lifecycle events + scoreboard payloads; ensure `sessionRoutes` behaves identically.
4. Ship CLI `scripts/dev_speed_typing_submission.ts` update to target new endpoints.

### Phase 2 — frontend integration (3 days)
1. Extend `useSpeedTypingSession` hook to consume new payload fields (promptId, timerToken, incidents).
2. Add spectate/debug panels for moderators (log incidents, show skew).
3. Provide migration doc for product team showing new UI behavior, fallbacks if engine flag flips off.

### Phase 3 — observability & rollout (2 days)
1. Wire StatsD/OTel counters and logs into existing dashboards.
2. Gather QA plan: run `pnpm test:integration` + Playwright suite with flag on in CI matrix.
3. Roll out to staging with limited participants; monitor autop-runbook referencing new doc.
4. If stable, flip default to new engine and delete legacy code after 1 sprint.

### Owner checklist
- [ ] Backend lead signs off on schema changes + migration.
- [ ] Frontend lead validates UI contract.
- [ ] QA signs off after regression pass.
- [ ] Release notes + README snippet updated.

_This section can be copied into an issue/epic to track progress. Keep checkboxes in sync with actual status._
