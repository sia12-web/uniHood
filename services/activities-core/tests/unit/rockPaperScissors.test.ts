import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RedisClientType } from "redis";
import type { SlidingWindowLimiter } from "../../src/lib/rateLimiter";
import type { TimerScheduler, TimerHandle } from "../../src/lib/timers";
import type { EventPublisher } from "../../src/lib/events";
import { createRockPaperScissorsService } from "../../src/services/rockPaperScissors";

function makeHarness() {
  const redisStore = new Map<string, string>();
  const redis = {
    async get(key: string) {
      return redisStore.get(key) ?? null;
    },
    async set(key: string, value: string) {
      redisStore.set(key, value);
    },
    async del(key: string) {
      redisStore.delete(key);
    },
  } as unknown as RedisClientType;

  const limiter: SlidingWindowLimiter = { check: vi.fn().mockResolvedValue(undefined) };
  const timerHandle: TimerHandle = { cancel: vi.fn() };
  const scheduler: TimerScheduler = {
    schedule: vi.fn(() => timerHandle),
    cancel: vi.fn(),
    setCallback: vi.fn(),
  };
  const publish = vi.fn(async () => {});
  const publisher: EventPublisher = { publish };

  const participantScores = new Map<string, number>();
  const scoreEvents: Array<{ userId: string; delta: number }> = [];
  const rounds: Array<{ state: string; payloadJson?: Record<string, unknown> }> = [];

  const prisma = {
    activity: { upsert: vi.fn(async () => ({ id: "act-rps" })) },
    activitySession: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: any) => ({ id: "sess-rps", ...data, status: "pending" })),
      findUnique: vi.fn(async ({ where }: any) => ({
        id: where.id,
        status: "running",
        metadataJson: { creatorUserId: "host" },
        activity: { key: "rock_paper_scissors" },
        participants: Array.from(participantScores.entries()).map(([userId, score]) => ({
          userId,
          score,
          joinedAt: new Date(),
        })),
        rounds: rounds.map((round, index) => ({ index, state: round.state ?? "queued" })),
      })),
      update: vi.fn(async () => ({})),
    },
    participant: {
      create: vi.fn(async ({ data }: any) => participantScores.set(data.userId, 0)),
      update: vi.fn(async ({ where, data }: any) => {
        const uid = where.sessionId_userId.userId;
        participantScores.set(uid, (participantScores.get(uid) ?? 0) + (data.score.increment ?? 0));
      }),
      findMany: vi.fn(async () => Array.from(participantScores.entries()).map(([userId, score]) => ({ userId, score }))),
      findUnique: vi.fn(async ({ where }: any) => ({ score: participantScores.get(where.sessionId_userId.userId) ?? 0 })),
    },
    round: {
      create: vi.fn(async ({ data }: any) => {
        rounds[data.index] = { state: data.state, payloadJson: data.payloadJson };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const idx = where.sessionId_index.index;
        rounds[idx] = { ...(rounds[idx] ?? {}), ...data };
      }),
    },
    scoreEvent: {
      create: vi.fn(async ({ data }: any) => {
        scoreEvents.push(data);
      }),
      findFirst: vi.fn(async () => scoreEvents.at(-1) ?? null),
    },
    $transaction: async (cb: (tx: any) => Promise<unknown>) => cb(prisma),
  } as any;

  const service = createRockPaperScissorsService({ prisma, redis, limiter, publisher, scheduler });
  return { service, publish, participantScores };
}

describe("rockPaperScissors service", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  async function bootstrapSession() {
    const harness = makeHarness();
    const sessionId = await harness.service.createSession({
      activityKey: "rock_paper_scissors",
      creatorUserId: "host",
      participants: ["host", "guest"],
      config: { rounds: 1, roundTimeMs: 5_000 },
    });
    await harness.service.joinSession({ sessionId, userId: "host" });
    await harness.service.joinSession({ sessionId, userId: "guest" });
    await harness.service.setReady({ sessionId, userId: "host", ready: true });
    await harness.service.setReady({ sessionId, userId: "guest", ready: true });
    await harness.service.startSession({ sessionId, byUserId: "host", isAdmin: false });
    await harness.service.handleTimerElapsed(sessionId, -1); // finish countdown
    return { sessionId, ...harness };
  }

  it("declares a winner when both moves are submitted", async () => {
    const { service, publish, sessionId } = await bootstrapSession();
    publish.mockClear();
    await service.submitMove({ sessionId, userId: "host", move: "rock" });
    await service.submitMove({ sessionId, userId: "guest", move: "scissors" });

    const events = (publish as any).mock.calls.map((call: any[]) => call[0]);
    const ended = events.find((evt: any) => evt.name === "activity.session.ended");
    expect(ended).toBeTruthy();
    expect(ended?.payload?.winnerUserId).toBe("host");
  });

  it("awards a forfeit win when opponent fails to play before timeout", async () => {
    const { service, publish, sessionId } = await bootstrapSession();
    publish.mockClear();
    await service.submitMove({ sessionId, userId: "host", move: "paper" });
    await service.handleTimerElapsed(sessionId, 0);

    const events = (publish as any).mock.calls.map((call: any[]) => call[0]);
    const roundEnded = events.find((evt: any) => evt.name === "activity.round.ended");
    expect(roundEnded?.payload?.winnerUserId).toBe("host");
    const sessionEnded = events.find((evt: any) => evt.name === "activity.session.ended");
    expect(sessionEnded?.payload?.winnerUserId).toBe("host");
  });

  it("ends session immediately if a participant leaves mid-match", async () => {
    const { service, publish, sessionId } = await bootstrapSession();
    publish.mockClear();
    await service.leaveSession({ sessionId, userId: "guest" });
    const events = (publish as any).mock.calls.map((call: any[]) => call[0]);
    const sessionEnded = events.find((evt: any) => evt.name === "activity.session.ended");
    expect(sessionEnded).toBeTruthy();
    expect(sessionEnded?.payload?.winnerUserId).toBe("host");
    expect(sessionEnded?.payload?.reason).toBe("opponent_left");
  });
});
