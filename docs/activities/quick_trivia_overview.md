# Quick Trivia Overview

This document walks through the Quick Trivia activity so new contributors can quickly understand the moving pieces across the backend (`services/activities-core`) and the Next.js frontend.

## Goals & Player Experience

- Two players join a lobby, ready up, and a countdown starts.
- Each round pulls a multiple-choice question with a strict timer.
- Players lock answers in real time via WebSocket messages.
- After the final round (or tie-breaker) the system announces a winner and publishes the final scoreboard.

## Backend Components

| File | Responsibility |
| --- | --- |
| `services/activities-core/src/services/quickTrivia.ts` | Main orchestration: session creation, lobby management, question selection, scoring, timers. |
| `services/activities-core/src/routes/sessionRoutes.ts` | REST endpoints (`/activities/session`, `/join`, `/leave`, `/ready`, `/start`) shared with other activities. The DTO `createQuickTriviaSessionDto` adds optional configs (round count, time limits). |
| `services/activities-core/src/ws/sessionStream.ts` | WebSocket entry point. After consuming the join permit it streams snapshots and accepts `submit` payloads (mapped to `submitQuickTriviaRoundDto`). |

### State & Redis Keys

- Persistent session rows live in Postgres (`activity_session`, `round`, `participant`).
- Runtime state is cached under `qt:sess:{sessionId}:state`:
  - `phase`: `"lobby" | "countdown" | "running" | "ended"`.
  - `answers`: map of `{ roundIndex -> { userId -> { choiceIndex, correct } } }`.
  - `presence`: tracks joined/ready flags and last seen timestamps.
  - `countdown` payload mirrored to the frontend.

### Lifecycle Outline

1. **Create Session**  
   `POST /activities/session` with `activityKey=quick_trivia` → `createQuickTriviaSession`.  
   - Validates unique participants.  
   - Seeds initial rounds using `prisma.triviaQuestion`.  
   - Initializes Redis state (`phase: "lobby"`, `lobbyReady: false`).  
   - Publishes `activity.session.created`.

2. **Join & Ready**  
   - Client polls `listQuickTriviaSessions` to discover invites.  
   - `/join` stores a short-lived permit (`grantSessionPermit`) and flips `presence.joined`.  
   - `/ready` toggles `presence.ready`. Once everyone is ready `maybeStartCountdown` triggers.

3. **Countdown → Running**  
   - Countdown events use the shared timer scheduler (`scheduler.schedule(sessionId, -1, countdownMs)`).  
   - When the timer fires, `beginCountdown` transitions to `phase: "running"`, marks round 0 as `running`, publishes `activity.session.started` and `activity.round.started`.

4. **Gameplay Loop**  
   - WebSocket `submit` messages call `submitRound` with `{ sessionId, userId, choiceIndex }`.  
   - Rate-limited at 5 submissions / 2s to stop spam.  
   - Answers are persisted per round; only the first submission per user counts.  
   - Once both players answer or the round timer expires, `endRound` tallies the scoreboard, persists outcomes, and either starts the next round or ends the session.

5. **Session End**  
   - `activity.session.ended` publishes the final scoreboard and optional tie-break metadata.  
   - Redis state is deleted to avoid stale snapshots.

### Timers & Cleanup

- Lobby countdown: `schedule(sessionId, -1, countdownMs)`.
- Round timers: `schedule(sessionId, roundIndex, config.timeLimitMs)`.
- If a countdown is cancelled (player unreadies) we clear timers to avoid ghost transitions.

## Frontend Components

| File | Description |
| --- | --- |
| `frontend/app/features/activities/hooks/useQuickTriviaSession.ts` | Core hook handling WebSocket join, presence updates, countdown progress, and round logic. |
| `frontend/app/activities/quick_trivia/page.tsx` | Entry page where users pick a friend, create sessions, and accept invites. |
| `frontend/app/features/activities/components/QuickTriviaPanel.tsx` | UI renderer using the hook state (question text, options, scoreboard, countdown). |
| `frontend/hooks/activities/use-quick-trivia-invite.ts` | Polls `/activities/sessions?status=pending` to surface invites only for the current user. |

### Client Flow

1. User opens `/activities/quick_trivia`. Page loads friends via `fetchFriends`.
2. Clicking “Create session” calls `createQuickTriviaSession` which POSTs to the shared `/activities/session` endpoint.
3. The page stores the returned session id and passes it into `QuickTriviaPanel`.
4. The panel uses `useQuickTriviaSession`:
   - Calls `joinSession` with retries (waiting for `participant_not_found` to resolve).
   - Opens the WebSocket stream with `authToken` and `userId` query params.
   - Reacts to `activity.session.presence`, `activity.session.countdown`, `activity.round.started`, `activity.round.ended`, `activity.session.ended`.
5. Players toggle ready to trigger countdown; once running, clicking an option sends a WebSocket `"submit"` message.

### Error Handling

- `useQuickTriviaSession` treats HTTP 410/404 as `session_expired`, surfaces toast messages, and resets state to `"ended"`.
- WebSocket errors (e.g., invalid payload) show toast notifications but keep UI responsive.
- Invite hook filters out sessions created by the current user or with mismatched opponent IDs.

## Operational Notes

- Trivia questions come from `prisma.triviaQuestion` seeded via scripts under `services/activities-core/scripts`.
- Adjusting round length or difficulty distribution: change `defaultConfig()` in `quickTrivia.ts` or pass a custom `config` payload when creating sessions.
- Monitoring: the activity publishes metrics via `publisher.publish` with names `activity.session.*`, `activity.round.*`, `activity.score.updated`. These feed whatever metrics backend (OpenTelemetry/Prometheus) you have wired to the `EventPublisher`.

## How to Extend

- **New scoring rules**: modify `submitRound` to change point allocation, ensuring you still update Prisma `scoreEvent` + `participant`.
- **Spectator mode**: extend WebSocket stream to broadcast additional summary messages; frontends could consume them for viewers.
- **More than two players**: require wider schema changes (question distribution, scoreboard). Start by updating `createQuickTriviaSessionDto` and state shape to support arrays longer than 2.

With this reference you should be able to trace the full lifecycle and confidently modify or extend Quick Trivia. Feel free to grep for `quick_trivia` across the repo if you need entry points not covered here.
