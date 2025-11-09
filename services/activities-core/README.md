# activities-core (SpeedTyping v2)

Purpose
- Provide low-latency micro-activity “Who Types Faster” between two connected users with real-time anti-cheat heuristics and v2 scoring.

Entities
- Activity (SpeedTyping only)
- ActivitySession
- Participant
- Round
- ScoreEvent
- AntiCheatEvent

Transports
- HTTP for session lifecycle
- WebSocket for live events and submissions

Persistence
- Postgres (Prisma)
- Redis: session runtime state, sliding-window rate limits, WebSocket permit TTLs

Outbound Events (WS channel: `/activities/session/:id/stream`)
- activity.session.created
- activity.session.started
- activity.round.started
- activity.round.ended
- activity.session.ended
- activity.score.updated (per participant)
- activity.anti_cheat.flag (real-time incident warnings)
- activity.penalty.applied (delta + incident summary after scoring)

Security
- Simple bearer auth middleware (stub). Creator or admin can start session.
- Zod-validated DTOs.

Performance
- WS pings every 20s, backpressure with per-conn queue <= 50 messages.
- Round timers executed server-side; clients are display-only timers.
- Keystroke samples and ping deltas feed an EWMA-based skew and burst detector.

## Local development

```
pnpm install
pnpm --filter @divan/activities-core prisma:generate
pnpm --filter @divan/activities-core dev
pnpm --filter @divan/activities-core test:unit
pnpm --filter @divan/activities-core test:integration
pnpm --filter @divan/activities-core test:ws
```

Set `DATABASE_URL`, `REDIS_URL`, and `API_BEARER_TOKEN` in `.env` or your shell before starting.

### Auth convention

Requests must include `Authorization: Bearer <token>`. When `API_BEARER_TOKEN` is set, the header value must follow:

```
Authorization: Bearer ${API_BEARER_TOKEN}:${userId}[:admin][:creator]
```

Use the optional `admin` / `creator` flags to elevate permissions for testing.

### WebSocket join flow

1. `POST /activities/session/:id/join` with `{ "userId": "abc" }`
2. Server grants a 60-second permit stored in Redis and responds with `{ ok: true, permitTtlSeconds: 60 }`
3. Client connects to `WS /activities/session/:id/stream` using the same bearer token; the permit is consumed on connect.
4. First server message is `session.snapshot`; subsequent messages mirror `activity.*` events.

### WebSocket client messages

- `keystroke` — payload `{ t, len, isPaste? }`; samples must be monotonically increasing and reference the client clock.
- `ping` — payload `{ t }`; server responds with `pong` applying skew adjustments and updating the EWMA estimator.
