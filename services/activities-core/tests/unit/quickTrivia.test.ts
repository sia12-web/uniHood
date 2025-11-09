import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQuickTriviaService } from "../../src/services/quickTrivia";
import type { RedisClientType } from "redis";
import type { TimerScheduler, TimerHandle } from "../../src/lib/timers";
import type { EventPublisher } from "../../src/lib/events";
import type { SlidingWindowLimiter } from "../../src/lib/rateLimiter";

// Minimal in-memory harness for unit-level behaviors: question picking & single-answer enforcement

function makeHarness(questions: Array<{ id: string; question: string; optionsJson: string[]; correctIndex: number; difficulty: string }>) {
  const redisStore = new Map<string, string>();
  const redis = {
    async get(key: string) { return redisStore.get(key) ?? null; },
    async set(key: string, val: string) { redisStore.set(key, val); },
    async del(key: string) { redisStore.delete(key); },
  } as unknown as RedisClientType;

  const limiter: SlidingWindowLimiter = { check: vi.fn().mockResolvedValue(undefined) };
  const timerHandle: TimerHandle = { cancel: vi.fn() };
  const scheduler: TimerScheduler = { schedule: vi.fn(() => timerHandle), cancel: vi.fn(), setCallback: vi.fn() };
  const publish = vi.fn(async () => {});
  const publisher: EventPublisher = { publish };

  const participantScores = new Map<string, number>();
  const rounds: any[] = [];
  const scoreEvents: any[] = [];

  const prisma = {
    activity: { upsert: vi.fn(async () => ({ id: "act1" })) },
    activitySession: {
      create: vi.fn(async ({ data }: any) => ({ id: "sess1", ...data, status: "pending" })),
      findUnique: vi.fn(async () => ({ id: "sess1", status: "running", metadataJson: { creatorUserId: "u1" }, activity: { key: "quick_trivia" }, participants: Array.from(participantScores.entries()).map(([userId, score]) => ({ userId, score, joinedAt: new Date() })), rounds: rounds.map((r, i) => ({ index: i, state: r.state })) })),
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
  return { service, publish, prisma, participantScores, redisStore };
}

describe("quickTrivia basic mechanics", () => {
  const sampleQuestions = Array.from({ length: 12 }).map((_, i) => ({
    id: `q${i}`,
    question: `Question ${i}?`,
    optionsJson: ["A","B","C","D"],
    correctIndex: i % 4,
    difficulty: i < 4 ? "E" : i < 8 ? "M" : "H",
  }));

  it("picks only requested difficulties", async () => {
    const { service, prisma } = makeHarness(sampleQuestions);
    // Override default config by passing difficulties subset
    const sessionId = await service.createSession({ activityKey: "quick_trivia", creatorUserId: "u1", participants: ["u1","u2"], config: { rounds: 3, difficulties: ["E"] } });
    // Force start
    await service.startSession({ sessionId, byUserId: "u1", isAdmin: false });
    // Inspect created rounds via prisma.round.create calls
    const createdRounds = (prisma.round.create as any).mock.calls.map((c: any[]) => c[0].data.payloadJson);
    expect(createdRounds).toHaveLength(3);
    // All selected questions must originate from difficulty E subset (first 4)
    const easyIds = new Set(sampleQuestions.slice(0,4).map(q=>q.id));
    for (const payload of createdRounds) {
      expect(easyIds.has(payload.qId)).toBe(true);
    }
  });

  it("enforces single answer per user per round", async () => {
    const { service, publish } = makeHarness(sampleQuestions);
    const sessionId = await service.createSession({ activityKey: "quick_trivia", creatorUserId: "u1", participants: ["u1","u2"], config: { rounds: 1 } });
    await service.startSession({ sessionId, byUserId: "u1", isAdmin: false });
    await service.submitRound({ sessionId, userId: "u1", choiceIndex: 0 });
    publish.mockClear();
    // Second submission should be ignored silently (no additional score.updated published for same user)
    await service.submitRound({ sessionId, userId: "u1", choiceIndex: 1 });
    const calls = (publish as any).mock.calls as any[];
    const scoreEvents = calls.filter((c: any[]) => c[0]?.name === "activity.score.updated");
    expect(scoreEvents).toHaveLength(0);
  });
});
