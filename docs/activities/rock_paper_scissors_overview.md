# Rock · Paper · Scissors Overview

Rock/Paper/Scissors (RPS) is the latest activity powered by the `activities-core` service. This guide explains the backend architecture, frontend integration, and operational behaviors so future contributors can reason about the feature quickly.

## Gameplay Summary

- Two players join a lobby, toggle “Ready”, and wait for a short countdown.
- Each round both players submit hidden moves (rock/paper/scissors) via WebSocket.
- Once both moves arrive or a round timer expires the system reveals the result, updates the score, and continues until one player reaches the win threshold (best-of configuration).
- If a player leaves mid-match, the opponent wins by forfeit. Idle lobbies automatically expire after 10 minutes.

## Backend Architecture

| File | Purpose |
| --- | --- |
| `services/activities-core/src/services/rockPaperScissors.ts` | Domain logic: session creation, lobby state, countdowns, round handling, inactivity cleanup. |
| `services/activities-core/src/routes/sessionRoutes.ts` | Shared REST endpoints; recognizes `activityKey: "rock_paper_scissors"` for `/activities/session`, `/start`, `/join`, `/leave`, and `/ready`. |
| `services/activities-core/src/ws/sessionStream.ts` | WebSocket handler. Detects RPS sessions and validates inbound `"submit"` payloads against `submitRpsMoveDto`. |

### State Management

- Redis key: `rps:sess:{sessionId}:state`.
- Shape (`SessionState`):
  - `phase`: `"lobby" | "countdown" | "running" | "ended"`.
  - `presence`: `userId -> { joined, ready, lastSeen }`.
  - `moves`: `roundIndex -> { userId -> move | null }`.
  - `score`: `userId -> integer`.
  - `lastActivityMs`: updated for every lobby interaction so we can expire idle sessions.

### Lifecycle

1. **Create Session**  
   `POST /activities/session` with `{ activityKey: "rock_paper_scissors" }`.  
   - Validates two unique participants.  
   - Seeds `totalRounds = config.rounds` (default best-of-3).  
   - Persists `activity_session` + initial rounds and stores Redis state.  
   - Publishes `activity.session.created`.

2. **Joining & Ready**  
   - `/join` ensures the user is a participant and flips `presence.joined`.  
   - `/ready` toggles `presence.ready`. When both players are ready, `maybeStartCountdown` sets `phase = "countdown"` and schedules a timer.

3. **Countdown / Lobby Timeout**  
   - Countdown uses the shared `TimerScheduler` with a special round index `-1`.  
   - A separate local `setTimeout` (`LOBBY_IDLE_MS`, currently 10 minutes) will auto-expire sessions stuck in lobby or countdown, publishing `activity.session.ended` with reason `"lobby_timeout"`.

4. **Rounds**  
   - When countdown finishes `beginRound` transitions to `running`, updates Prisma (`activity_session.status = "running"`, `round.state = "running"`), publishes `activity.round.started`, and opens the commit window (`roundTimeMs`, default 10s).  
   - WebSocket `"submit"` payloads look like `{ userId, move }`. The service ignores duplicate submissions per round.  
   - `resolveRound` determines the winner (beats logic) or draw, persists score events, emits `activity.score.updated` and `activity.round.ended`.

5. **End Conditions**  
   - Win threshold = `floor(rounds / 2) + 1`. Once a player reaches it we publish `activity.session.ended` with reason `"win_threshold"`.  
   - If a round completes all configured matches, highest score wins (ties leave `winnerUserId` undefined).  
   - Leaving mid-match calls `leaveSession` which grants the remaining player victory and ends the session immediately.  
   - Inactivity: a scheduler entry `-2` ends running sessions if `lastActivityMs` is stale (currently two minutes).

### Key Timers

| Purpose | Mechanism |
| --- | --- |
| Lobby countdown | `scheduler.schedule(sessionId, -1, countdownMs)` |
| Running round timeout | `scheduler.schedule(sessionId, roundIndex, roundTimeMs)` |
| Running inactivity | `scheduler.schedule(sessionId, -2, INACTIVITY_MS)` |
| Lobby expiry | Local `setTimeout` tracked in `lobbyExpiryHandles` (cleared when match starts) |

### Clean-up on `/activities/sessions`

- `listSessionsForUser` loads Redis state for each session and filters out ones whose `phase` is lobby/countdown *and* their `lastActivityMs` exceeds the idle window. These are expired on the spot before returning results.
- Clients receive an optional `expiresAt` timestamp so they can hide soon-to-expire sessions if desired.

## Frontend Integration

| File | Role |
| --- | --- |
| `frontend/app/activities/rock_paper_scissors/page.tsx` | Entry point for creating sessions, selecting friends, and accepting invites. |
| `frontend/hooks/activities/use-rock-paper-scissors-invite.ts` | Polls `/activities/sessions?status=pending`, filtering out sessions created by the current user or those past `expiresAt`. |
| `frontend/app/features/activities/api/client.ts` | Adds `createRockPaperScissorsSession`, `listRockPaperScissorsSessions`, and lobby summary typings. |
| `frontend/app/features/activities/hooks/useRockPaperScissorsSession.ts` | Manages REST join, WebSocket connection, ready toggles, and move submissions from the browser. |
| `frontend/app/features/activities/components/RockPaperScissorsPanel.tsx` | Renders lobby presence, countdown, scoreboard, move buttons, and outcome banners based on the hook state. |

### Client Flow

1. User opens `/activities/rock_paper_scissors`.
2. Selecting a friend triggers `createRockPaperScissorsSession`, which POSTs to `/activities/session`. The session id is stored in state and passed into the `RockPaperScissorsPanel`.
3. The panel uses `useRockPaperScissorsSession`:
   - Calls `joinSession(sessionId, selfId)` with exponential backoff.  
   - Opens `ws(s)/activities/session/{id}/stream?authToken=...&userId=...`.  
   - Responds to `"session.snapshot"`, `"activity.session.presence"`, `"activity.session.countdown"`, `"activity.round.started"`, `"activity.round.ended"`, `"activity.session.ended"`.
   - Provides handlers `readyUp`, `unready`, and `submitMove`.  
   - Tracks `phase`, `countdown`, `scoreboard`, `lastRoundWinner`, and disable states for move buttons after committing.

### UX Notes

- Move buttons are disabled once a player submits to avoid duplicate sends.
- Lobby shows both players with “Connected”/“Ready” badges; ready toggles call the shared `/ready` endpoint.
- Countdown + timer values are derived from the server to stay authoritative.

## Operational Guidance

- **Config Tweaks**: adjust `DEFAULT_CONFIG` or accept overrides via the `config` payload when creating sessions (round count, round duration, countdown length).
- **Idle Session Cleanup**: Lobby expiry ensures `/activities/sessions` doesn’t fill with abandoned sessions. If ops needs a harder guarantee, run a daily SQL job to delete `activity_session` rows where `activity.key = 'rock_paper_scissors'` and `status = 'pending'` older than a threshold—this complements the runtime sweeper.
- **Monitoring**: hooking into `activity.session.*` and `activity.round.*` events gives observability on matches started/ended, lobby timeouts, and score updates.
- **Future Enhancements**:  
  - Add TLS-protected commit/reveal so moves are hashed before reveal (current implementation is optimistic).  
  - Support more than two rounds/players by extending the scoring logic.  
  - Add spectator state by broadcasting sanitized snapshots to any listeners (currently only participants receive updates).

Armed with this doc you should be able to reason about Rock/Paper/Scissors end-to-end and confidently implement changes or new features.
