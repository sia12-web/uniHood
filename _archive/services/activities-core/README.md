# activities-core (SpeedTyping v2)

## Purpose
Provide low-latency micro-activity “Who Types Faster” between two connected users with real-time anti-cheat heuristics and v2 scoring.

## Entities
- Activity (SpeedTyping only)
- ActivitySession
- Participant
- Round
- ScoreEvent
- AntiCheatEvent

## Transports
- **HTTP**: Session lifecycle
- **WebSocket**: Live events and submissions

## Persistence
- **Postgres (Prisma)**: Permanent storage
- **Redis**: Session runtime state, sliding-window rate limits, WebSocket permit TTLs

## Local Development

### Setup

```bash
cd services/activities-core
npm install
```

### Database

```bash
# Generate Prisma Client
npx prisma generate

# Apply Migrations
npx prisma migrate dev
```

### Running the Service

```bash
npm run dev
```

### Running Tests

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests
npm run test:integration # Integration tests
npm run test:ws       # WebSocket tests
```

**Note**: Set `DATABASE_URL`, `REDIS_URL`, and `API_BEARER_TOKEN` in `.env` (or use `.env.example`) before starting.

## Auth Convention

Requests must include `Authorization: Bearer <token>`. When `API_BEARER_TOKEN` is set, the header value must follow:

```
Authorization: Bearer ${API_BEARER_TOKEN}:${userId}[:admin][:creator]
```

Use the optional `admin` / `creator` flags to elevate permissions for testing.

## WebSocket Flow

1.  **Join**: `POST /activities/session/:id/join` with `{ "userId": "abc" }`
    - Server grants a 60-second permit stored in Redis.
2.  **Connect**: Client connects to `WS /activities/session/:id/stream` using the same bearer token.
3.  **Snapshot**: First server message is `session.snapshot`.

## WebSocket Client Messages

- `keystroke`: `{ t, len, isPaste? }` - Samples must be monotonically increasing.
- `ping`: `{ t }` - Server responds with `pong` for skew adjustments.
