# Speed Typing Activity — Developer Overview

_Last updated: 2025-11-17_

This document walks through how our Speed Typing duel works (backend and frontend), how to run it, and the points that were recently adjusted (single active session, 10s countdown blur, fastest perfect wins).

## What this activity is
- Two-player head-to-head typing duel.
- Single round by design (enforced backend) with a 10-second pre-start countdown shown to both players.
- Scores: perfect submission scores 100 + speed bonus; non-perfect incurs a penalty. Fastest perfect submission ends the round and wins; otherwise ends when both submit.
- One active session at a time for this activity (new session ends any pending/running speed_typing session).
- Winner and score lead are published via websocket events; UI shows live lead and winner banner.

## Backend (services/activities-core)
- Service file: `services/activities-core/src/services/speedTyping.ts`
- Key behaviors:
  - Single active session: `createSession` ends any pending/running speed_typing session before creating a new one.
  - Countdown: 10 seconds (`LOBBY_COUNTDOWN_MS = 10_000`), cancellable if someone un-readies; begins when both players ready.
  - Round flow: single round, timers via `TimerScheduler`, state cached in Redis `sess:{sessionId}:state`.
  - Scoring: fastest perfect gets 100 + speed bonus (based on remaining time), non-perfect gets -25. Round may end early on first perfect or when both submit.
  - Winner: `activity.session.ended` includes `winnerUserId`; leaderboard/score lead pulled from `participant.score` and `scoreEvent`.
  - Routes: exposed via `/activities/session*` handlers in `services/activities-core/src/routes/sessionRoutes.ts` (existing speed typing routes used by the UI; WS stream at `/activities/session/:id/stream`).
  - Events: `activity.session.countdown`, `.countdown.cancelled`, `.session.started`, `.round.started`, `.round.ended`, `.session.ended`, `.score.updated` (consumed by frontend hooks).
- Anti-cheat / telemetry:
  - Keystroke capture + incident tracking in `recordKeystroke`; paste/late-input detection; skew updates in `updateSkewEstimate`.

## Frontend (Next.js app)
- Entry page: `frontend/app/activities/speed_typing/page.tsx`
  - Client-only: friend selector, invite inbox, session creation via `/api/activities/session` (speed_typing), shows session id to share.
  - Uses `useTypingDuelInvite` polling to surface invites.
- Session shell/panel:
  - Hook: `frontend/app/features/activities/hooks/useSpeedTypingSession.ts` handles WS stream, presence, countdown, score updates, winner, metrics.
  - Panel: `frontend/app/features/activities/components/SpeedTypingPanel.tsx`
    - Lobby: joined/ready list, ready/start buttons (host starts countdown).
    - Countdown: blurred overlay with big 10→0, input disabled.
    - Running: typing area (paste guarded), live WPM/accuracy/progress, submit button.
    - Score lead and winner banner displayed from live scoreboard and `winnerUserId`.
- WS endpoint: `/api/activities/session/:id/stream` (Fastify WS) for submissions and updates.

## How to run locally
1) Backend: from repo root, ensure DB/Redis up, env set (`services/activities-core/.env`), run `pnpm --filter activities-core dev`.
2) Frontend: from repo root, run `pnpm --filter frontend dev`, open `/activities/speed_typing`.
3) Create a duel: select a friend on the page, click “Create duel” (replaces any existing session).
4) Both players open the link/session, click Ready → 10s blur countdown → type. Fastest perfect submission wins; winner banner shows for both.

## Data/events to know
- REST:
  - `POST /activities/session` `{ activityKey: "speed_typing", creatorUserId, participants }`
  - `POST /activities/session/:id/start|join|leave|ready`
  - `GET /activities/session/:id` (snapshot)
- WS:
  - Submit: `{ type: "submit", payload: { userId, typedText, clientMs? } }`
  - Server emits snapshots + `activity.session.countdown`, `activity.round.started|ended`, `activity.score.updated`, `activity.session.ended`.

## Recent adjustments (Nov 2025)
- Enforced single active speed_typing session (new session ends prior ones).
- Countdown duration set to 10s; frontend blur overlay matches both players.
- Scoring tweaked for fastest perfect; winner emitted in session ended payload.
- Frontend shows score lead, user names/ids, and winner animation/banner.

## If extending
- Keep WS payload compatibility (`SessionView`, `score.updated`, `session.ended`).
- If adding multiple rounds, adjust scoring and countdown behavior accordingly.
- For additional anti-cheat, tie into `recordKeystroke`/incidents and surface flags in UI.
