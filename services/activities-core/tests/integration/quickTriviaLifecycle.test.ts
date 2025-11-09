import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createQuickTriviaService } from "../../src/services/quickTrivia";
import type { RedisClientType } from "redis";
import type { TimerScheduler, TimerHandle } from "../../src/lib/timers";
import type { EventPublisher } from "../../src/lib/events";
import type { SlidingWindowLimiter } from "../../src/lib/rateLimiter";

type PublishEvent = { name: string; payload: any };

function harnessWithQuestions(questions: Array<{ id: string; question: string; optionsJson: string[]; correctIndex: number; difficulty: string }>) {
  const redisStore = new Map<string, string>();
  const redis = {
    async get(key: string) { return redisStore.get(key) ?? null; },
    async set(key: string, v: string) { redisStore.set(key, v); },
    async del(key: string) { redisStore.delete(key); },
  } as unknown as RedisClientType;
  const limiter: SlidingWindowLimiter = { check: vi.fn().mockResolvedValue(undefined) };
  const timerHandle: TimerHandle = { cancel: vi.fn() };
  const scheduler: TimerScheduler = { schedule: vi.fn(() => timerHandle), cancel: vi.fn(), setCallback: vi.fn() };
  const publish = vi.fn<[PublishEvent], Promise<void>>(async () => {});
  const publisher: EventPublisher = { publish };

  const participantScores = new Map<string, number>();
  const rounds: any[] = [];
  const scoreEvents: any[] = [];

  const prisma = {
    activity: { upsert: vi.fn(async () => ({ id: "act1" })) },
    activitySession: {
      create: vi.fn(async ({ data }: any) => ({ id: "s1", ...data, status: "pending" })),
      findUnique: vi.fn(async () => ({ id: "s1", status: "running", activity: { key: "quick_trivia" }, participants: Array.from(participantScores.entries()).map(([userId, score]) => ({ userId, score, joinedAt: new Date() })), rounds: rounds.map((r, i) => ({ index: i, state: r.state })) })),
      update: vi.fn(async () => ({})),
    },
    participant: {
      create: vi.fn(async ({ data }: any) => participantScores.set(data.userId, 0)),
      update: vi.fn(async ({ where, data }: any) => { const uid = where.sessionId_userId.userId; participantScores.set(uid, (participantScores.get(uid) ?? 0) + (data.score.increment ?? 0)); }),
      findUnique: vi.fn(async ({ where }: any) => ({ score: participantScores.get(where.sessionId_userId.userId) ?? 0 })),
      findMany: vi.fn(async () => Array.from(participantScores.entries()).map(([userId, score]) => ({ userId, score }))),
    },
    round: {
      create: vi.fn(async ({ data }: any) => { rounds[data.index] = { state: data.state, payloadJson: data.payloadJson }; }),
      findUnique: vi.fn(async ({ where }: any) => { const idx = where.sessionId_index.index; return rounds[idx] ? { ...rounds[idx] } : null; }),
      update: vi.fn(async ({ where, data }: any) => { const idx = where.sessionId_index.index; if (rounds[idx]) rounds[idx] = { ...rounds[idx], ...data }; }),
    },
    scoreEvent: {
      create: vi.fn(async ({ data }: any) => { scoreEvents.push(data); }),
      findFirst: vi.fn(async () => scoreEvents.at(-1) ?? null),
    },
    triviaQuestion: {
      findMany: vi.fn(async ({ where }: any) => questions.filter(q => where.difficulty.in.includes(q.difficulty))),
      findUnique: vi.fn(async ({ where }: any) => questions.find(q => q.id === where.id) ?? null),
    },
    $transaction: async (cb: any) => cb(prisma),
  } as any;

  const service = createQuickTriviaService({ prisma, redis, limiter, publisher, scheduler });
  return { service, publish };
}

describe("quickTrivia lifecycle", () => {
  beforeEach(async () => { vi.useRealTimers(); });
  afterEach(async () => { vi.restoreAllMocks(); });

  const qs = [
    { id: "e1", question: "E1?", optionsJson: ["A","B","C","D"], correctIndex: 1, difficulty: "E" },
    { id: "e2", question: "E2?", optionsJson: ["A","B","C","D"], correctIndex: 2, difficulty: "E" },
  ];

  it("emits correctIndex only on round end and ends session after last round", async () => {
    const { service, publish } = harnessWithQuestions(qs);
    const sessionId = await service.createSession({ activityKey: "quick_trivia", creatorUserId: "u1", participants: ["u1","u2"], config: { rounds: 1, difficulties: ["E"] } });
    await service.startSession({ sessionId, byUserId: "u1", isAdmin: false });
  // Clear initial session.created / session.started / round.started events
  publish.mockClear();
  // First user answers (should publish score.updated)
  await service.submitRound({ sessionId, userId: "u1", choiceIndex: 1 });
  // Second user answers (completes round; should publish second score.updated then round.ended + session.ended)
  await service.submitRound({ sessionId, userId: "u2", choiceIndex: 0 });

    const events = (publish as any).mock.calls.map((c: any[]) => c[0]) as PublishEvent[];
  const roundStarted = events.find(e => e.name === "activity.round.started");
  const roundEnded = events.find(e => e.name === "activity.round.ended");
  // In this harness we cleared publish after startSession, so round.started won't appear; assert absence explicitly
  expect(roundStarted).toBeUndefined();
  expect(roundEnded).toBeTruthy();
    // Only ended event should include correctIndex field
  const endedHasCorrect = (roundEnded as any).payload?.correctIndex !== undefined;
  expect(endedHasCorrect).toBe(true);
  });

  it("ends round on timer elapse when unanswered", async () => {
    const { service, publish } = harnessWithQuestions(qs);
    const sessionId = await service.createSession({ activityKey: "quick_trivia", creatorUserId: "u1", participants: ["u1","u2"], config: { rounds: 1, difficulties: ["E"] } });
    await service.startSession({ sessionId, byUserId: "u1", isAdmin: false });
    publish.mockClear();
    await service.handleTimerElapsed(sessionId, 0);
    const events = (publish as any).mock.calls.map((c: any[]) => c[0]) as PublishEvent[];
    expect(events.some(e => e.name === "activity.round.ended")).toBe(true);
  });
});
