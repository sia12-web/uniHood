# Phase 5 Mini-Activities Test Plan

## Automated Coverage
- **Backend unit tests** (`backend/tests/unit/test_activities_service.py`)
	- Typing duel end-to-end flow: create, start, dual submission, scoring, completion.
	- Story alternation: verifies turn enforcement, finalization after configured turns.
	- Trivia scoring: confirms correct/incorrect submissions, scoreboard totals, activity completion.
	- RPS commit/reveal cycle: hashes, reveal validation, scoreboard updates.
	- Trivia reseed guard: ensures lobby-only reseed rewrites question bank.
- **Frontend unit tests** (`frontend/__tests__/activities.lib.spec.ts`)
	- Scoreboard normalization and summary hydration helpers.

## Manual / Exploratory Scenarios
- **Typing Duel**
	1. Player A creates activity with Player B, starts match.
	2. Both clients navigate to `/activities/typing/[id]`, confirm prompt sync.
	3. Submit text before timer expiry, verify live scoreboard broadcast.
- **Story Tag**
	1. Start story, ensure turn indicator and timer swap on submission.
	2. Attempt out-of-turn submit → expect error toast.
- **Trivia**
	1. Answer correctly/incorrectly and observe revealed indicators post round.
	2. Validate countdown resets between questions.
- **RPS**
	1. Commit from two browsers, then reveal; ensure stored nonce survives refresh via local storage.
	2. Confirm scoreboard increments until best-of threshold reached, activity auto-completes.
- **Resilience**
	- Cancel lobby match → state and UI update.
	- Expired timers: allow timer to elapse to witness server-driven cleanup (activity moves to `expired`).
- **Sockets**
	- Disconnect/reconnect during active match; verify rejoin restores scoreboard via REST fetch and future events stream.

## Tooling
- Backend: `pytest` (all unit tests) with fakeredis patching for deterministic rate limits.
- Frontend: `vitest run` for helper functions and component utilities.
