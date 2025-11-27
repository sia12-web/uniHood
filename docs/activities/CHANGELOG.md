# Activities Change Log

## Backend (activities-core)
- Story Builder now rebuilds missing lobby state from Prisma, resumes countdown timers after restarts, and uses `session_state_missing:*` errors for clearer diagnostics. Lobby mutations update `lastActivityMs` to keep idle detection consistent.
- Speed Typing now mirrors Quick Trivia/RPS resilience: it can rebuild lobby state from the database, resumes countdown/running timers if Redis was cleared or the service restarted, and shares the same countdown/inactivity safeguards.
- Added unit coverage for Story Builder lifecycle recovery and Speed Typing state rebuild/countdown resumption to guard future refactors.

## Frontend
- Fixed lint/type issues across invites and activities UI: cleaned unused imports/state, tightened Story session typing, normalized invite toasts, and aligned suggested-people rendering with mapped fields.
- Escaped unescaped text in DiscoveryFeed and removed unsupported toast `action` payloads to satisfy lint/type rules.

## Tests Run
- `cd services/activities-core && pnpm test:unit`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
