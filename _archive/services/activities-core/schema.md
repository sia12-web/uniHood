# Prisma schema and Zod DTOs (SpeedTyping v1)

## Prisma models
model Activity {
  id          String   @id @default(cuid())
  key         String   @unique
  name        String
  configJson  Json
  createdAt   DateTime @default(now())
  sessions    ActivitySession[]
}

model ActivitySession {
  id          String       @id @default(cuid())
  activityId  String
  status      String       // 'pending' | 'running' | 'ended'
  startedAt   DateTime?
  endedAt     DateTime?
  metadataJson Json?
  activity    Activity     @relation(fields: [activityId], references: [id])
  participants Participant[]
  rounds      Round[]
  scoreEvents ScoreEvent[]
}

model Participant {
  id        String   @id @default(cuid())
  sessionId String
  userId    String
  joinedAt  DateTime @default(now())
  leftAt    DateTime?
  score     Int      @default(0)
  session   ActivitySession @relation(fields: [sessionId], references: [id])

  @@unique([sessionId, userId])
}

model Round {
  id        String   @id @default(cuid())
  sessionId String
  index     Int
  state     String   // 'queued' | 'running' | 'done'
  startedAt DateTime?
  endedAt   DateTime?
  payloadJson Json   // text to type, timeLimitMs
  session   ActivitySession @relation(fields: [sessionId], references: [id])

  @@unique([sessionId, index])
}

model ScoreEvent {
  id        String   @id @default(cuid())
  sessionId String
  userId    String
  delta     Int
  reason    String   // 'round' | 'penalty'
  at        DateTime @default(now())
  session   ActivitySession @relation(fields: [sessionId], references: [id])
}

## Zod DTOs
- CreateSessionDto { activityKey: 'speed_typing'; creatorUserId: string; participants: string[2] (including creator, unique) }
- JoinSessionDto { userId: string }
- SubmitRoundDto { userId: string; typedText: string; clientMs?: number }
- SessionView {
    id, status, activityKey, participants: {userId, score}[], 
    currentRoundIndex?: number, rounds: { index, state }[],
    lobbyPhase?: boolean
  }
- RoundView { index, state, payload: { textSample: string; timeLimitMs: number } }
- ScoreboardView { participants: {userId, score}[], lastDelta?: {userId, delta} }
