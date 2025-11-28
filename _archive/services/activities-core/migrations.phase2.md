# DB Migration (Phase 2)

- Create table AntiCheatEvent(
    id TEXT PK default cuid(),
    sessionId TEXT NOT NULL,
    roundIndex INT NOT NULL,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    metaJson JSONB,
    at TIMESTAMP NOT NULL DEFAULT now()
  )
- Ensure indexes:
  - (sessionId, roundIndex)
  - (sessionId, userId)
