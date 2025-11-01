# Phase 5 Mini-Activities Spec

## Overview
- Deliver a head-to-head mini-activities experience for paired friends.
- Supported modes: typing duel, alternating story, trivia quiz, rock/paper/scissors best-of matches.
- Each activity flows through lobby → active gameplay → completion/cancel states and surfaces real-time updates via Socket.IO.

## Backend
- FastAPI router under `/activities` handles creation, lifecycle actions, prompts, and submissions per mode.
- `ActivitiesService` coordinates persistence (PostgreSQL with in-memory fallback), timers on Redis, scoring, and outbox emission for downstream analytics.
- Migration `0004_activities.sql` provisions activity, round, and per-mode tables (typing submissions, story lines, trivia answers, RPS moves).
- Scoring logic:
	- Typing: Levenshtein accuracy × words-per-minute for prompt vs. submission.
	- Story: Non-numeric (turn based) but retains per-user totals for extensibility.
	- Trivia: Correct answers earn 1.0, latency stored for tiebreaks.
	- RPS: Winner receives 1 point per resolved round; draws record zero.
- Policy guards enforce friendship checks, rate limits (Redis buckets), turn ownership, input constraints, and commit/reveal integrity.
- Socket namespace `/activities` broadcasts activity lifecycle, round openings, incremental scores, story lines, trivia questions, RPS phase shifts, and completion notices.

## Frontend
- Next.js routes under `/activities` provide:
	- `/activities/[peerId]` dashboard to create, start, cancel, and inspect matches.
	- `/activities/typing/[matchId]` real-time duel interface with timer and score table.
	- `/activities/story/[matchId]` alternating story composer with turn timer and transcript.
	- `/activities/trivia/[matchId]` multiple-choice ladder with countdown and revealed answers post-scoring.
	- `/activities/rps/[matchId]` commit/reveal workflow, persisting nonce + hash per round to local storage for reliability.
- `frontend/lib/activities.ts` wraps REST APIs, socket events, and scoreboard normalization helpers.
- Shared UI components: `TypingPrompt`, `StoryBoard`, `TriviaBoard` provide consistent rendering for prompts and transcripts.

## Sockets & Timers
- Clients authenticate using demo headers and subscribe per activity (`activity_join`/`activity_leave`).
- Timers stored in Redis provide server-side timeouts; client pages maintain optimistic countdowns from emitted close timestamps.
- Score updates broadcast to both participants after every completed round.

## Observability & Outbox
- Activity/score events fan out to Redis streams (`x:activities.events`, `x:activities.scores`) for analytics and replay.
- Completion/cancel reasons recorded to support retention metrics.

## Constraints & Limits
- Activity create limit: 50/day per user.
- Action limit: 120/min per user for submissions/commits.
- Story turn limit enforced at 400 chars by default (configurable via options).
- Trivia reseed only permitted while in lobby state.
