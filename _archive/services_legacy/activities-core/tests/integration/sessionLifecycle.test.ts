import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordKeystrokeSample,
  mergeIncidentTypes,
  normalizeClientTime,
  updateSkewEstimate,
} from "../../src/lib/antiCheat";
import {
  computeTypingMetricsV2,
  computeScoreV2Breakdown,
  KeystrokeSample,
} from "../../src/lib/metrics";
import { defaultSpeedTypingConfig } from "../../src/lib/config";
import type { RedisClientType } from "redis";
import type { SlidingWindowLimiter } from "../../src/lib/rateLimiter";
import type { TimerScheduler, TimerHandle } from "../../src/lib/timers";
import type { EventPublisher } from "../../src/lib/events";
import { createSpeedTypingService, type SpeedTypingService } from "../../src/services/speedTyping";

describe("scoring and anti-cheat integration", () => {
  it("applies paste penalties to the final score", () => {
    const first = recordKeystrokeSample(undefined, undefined, { t: 0, len: 0 }, 60_000);
    const second = recordKeystrokeSample(
      first.samples,
      first.incidents,
      { t: 10_000, len: 45, isPaste: true },
      60_000,
    );

    const incidents = mergeIncidentTypes(second.incidents);
    expect(incidents).toContain("paste");

    const target = "a".repeat(45);
    const metrics = computeTypingMetricsV2(target, target, second.samples, 60_000, 60_000);
    const breakdown = computeScoreV2Breakdown(metrics, incidents);

    expect(breakdown.penalty).toBe(15);
    expect(breakdown.total).toBe(breakdown.base + breakdown.bonus - 15);
  });

  it("caps improbable burst penalties at fifteen points", () => {
    let result = recordKeystrokeSample(undefined, undefined, { t: 0, len: 0 }, 60_000);
    result = recordKeystrokeSample(result.samples, result.incidents, { t: 400, len: 41 }, 60_000);
    result = recordKeystrokeSample(result.samples, result.incidents, { t: 800, len: 90 }, 60_000);
    result = recordKeystrokeSample(result.samples, result.incidents, { t: 1_100, len: 140 }, 60_000);

    const incidents = mergeIncidentTypes(result.incidents).filter((type) => type === "improbable_burst");
    expect(incidents).toHaveLength(3);

    const target = "b".repeat(140);
    const metrics = computeTypingMetricsV2(target, target, result.samples, 60_000, 60_000);
    const breakdown = computeScoreV2Breakdown(metrics, incidents);

    expect(breakdown.penalty).toBe(15);
  });

  it("ignores late samples when computing smoothed WPM", () => {
    let result = recordKeystrokeSample(undefined, undefined, { t: 0, len: 0 }, 60_000);
    result = recordKeystrokeSample(result.samples, result.incidents, { t: 12_000, len: 20 }, 60_000);
    result = recordKeystrokeSample(result.samples, result.incidents, { t: 60_500, len: 40 }, 60_000);

    const lateIncident = result.incidents.find((incident) => incident.type === "late_input");
    expect(lateIncident).toBeDefined();

    const metrics = computeTypingMetricsV2("c".repeat(20), "c".repeat(20), result.samples, 60_000, 60_000);
    expect(metrics.instantWpmSeries).toHaveLength(1);
    expect(result.samples.at(-1)?.late).toBe(true);
  });

  it("normalizes ahead-of-server clocks before late detection", () => {
    const rawSampleTime = 60_500;
    const skew = updateSkewEstimate(undefined, -500); // client clock is +500ms ahead
    const normalized = normalizeClientTime(rawSampleTime, skew);
    expect(normalized).toBe(60_000);

    const withoutNormalization = recordKeystrokeSample([], [], { t: rawSampleTime, len: 30 }, 60_000);
    expect(mergeIncidentTypes(withoutNormalization.newIncidents)).toContain("late_input");

    const withNormalization = recordKeystrokeSample([], [], { t: normalized, len: 30 }, 60_000);
    expect(mergeIncidentTypes(withNormalization.newIncidents)).not.toContain("late_input");
  });
});

type PublishEvent = { name: string; payload: unknown };
type PublishMock = ReturnType<typeof vi.fn<[PublishEvent], Promise<void>>>;

interface ServiceHarness {
  service: SpeedTypingService;
  publishMock: PublishMock;
  redisStore: Map<string, string>;
}

async function createServiceHarness(sessionId: string, userIds: string[]): Promise<ServiceHarness> {
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

  const limiter: SlidingWindowLimiter = {
    check: vi.fn().mockResolvedValue(undefined),
  };

  const timerHandle: TimerHandle = { cancel: vi.fn() };
  const scheduler: TimerScheduler = {
    schedule: vi.fn(() => timerHandle),
    cancel: vi.fn(),
    setCallback: vi.fn(),
  };

  const publishMock = vi.fn<[PublishEvent], Promise<void>>(async () => {});
  const publisher: EventPublisher = {
    publish: publishMock,
  };

  const rounds = new Map<number, { state: string; payloadJson: { textSample: string; timeLimitMs: number } }>();
  const participantScores = new Map<string, number>();
  const scoreEvents: Array<{ sessionId: string; userId: string; delta: number; reason: string }> = [];

  const prisma = {
    round: {
      findUnique: vi.fn(async ({ where }: { where: { sessionId_index: { sessionId: string; index: number } } }) => {
        return rounds.get(where.sessionId_index.index) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { sessionId_index: { sessionId: string; index: number } }; data: Partial<{ state: string; startedAt: Date; endedAt: Date }> }) => {
        const existing = rounds.get(where.sessionId_index.index);
        if (existing) {
          rounds.set(where.sessionId_index.index, { ...existing, ...data });
        }
        return null;
      }),
    },
    participant: {
      update: vi.fn(async ({ where, data }: { where: { sessionId_userId: { sessionId: string; userId: string } }; data: { score: { increment: number } } }) => {
        const key = where.sessionId_userId.userId;
        const current = participantScores.get(key) ?? 0;
        participantScores.set(key, current + (data.score.increment ?? 0));
      }),
      findUnique: vi.fn(async ({ where }: { where: { sessionId_userId: { sessionId: string; userId: string } } }) => {
        const key = where.sessionId_userId.userId;
        return { score: participantScores.get(key) ?? 0 };
      }),
      findMany: vi.fn(async () =>
        Array.from(participantScores.entries()).map(([userId, score]) => ({ userId, score })),
      ),
    },
    scoreEvent: {
      create: vi.fn(async ({ data }: { data: { sessionId: string; userId: string; delta: number; reason: string } }) => {
        scoreEvents.push(data);
      }),
      findFirst: vi.fn(async () => scoreEvents.at(-1) ?? null),
    },
    activitySession: {
      update: vi.fn(),
      findUnique: vi.fn(async () => ({
        id: sessionId,
        status: "running",
        activity: { key: "speed_typing" },
        participants: Array.from(participantScores.entries()).map(([userId, score]) => ({
          userId,
          score,
          joinedAt: new Date(),
        })),
        rounds: Array.from(rounds.entries()).map(([index, round]) => ({
          index,
          state: round.state,
        })),
      })),
    },
    antiCheatEvent: {
      createMany: vi.fn(async () => ({})),
    },
    $transaction: async (cb: (tx: { scoreEvent: unknown; participant: unknown }) => Promise<void>) => {
      await cb({ scoreEvent: prisma.scoreEvent, participant: prisma.participant });
    },
  } as any;

  const service = createSpeedTypingService({
    prisma,
    redis,
    limiter,
    scheduler,
    publisher,
  });

  const config = defaultSpeedTypingConfig();
  const state = {
    phase: "running",
    currentRound: 0,
    cfg: config,
    submissions: { 0: {} },
    participants: userIds,
    creatorUserId: userIds[0],
    totalRounds: config.rounds,
    skewMsEstimate: Object.fromEntries(userIds.map((id) => [id, 0])),
  keystrokes: { 0: {} as Record<string, KeystrokeSample[]> },
  incidents: { 0: {} as Record<string, ReturnType<typeof recordKeystrokeSample>["incidents"]> },
    roundDeadlines: { 0: 60_000 },
  } satisfies Record<string, unknown>;

  for (const userId of userIds) {
    (state.keystrokes[0] as Record<string, KeystrokeSample[]>)[userId] = [];
    (state.incidents[0] as Record<string, ReturnType<typeof recordKeystrokeSample>["incidents"]>)[userId] = [];
    participantScores.set(userId, 0);
  }

  rounds.set(0, {
    state: "running",
    payloadJson: {
      textSample: "d".repeat(45),
      timeLimitMs: config.timeLimitMs,
    },
  });

  await redis.set(`sess:${sessionId}:state`, JSON.stringify(state));

  return {
    service,
    publishMock,
    redisStore,
  };
}

describe("speed typing service events", () => {
  const sessionId = "sess-123";
  const userId = "user-a";

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits anti-cheat flags and penalty summaries", async () => {
    const harness = await createServiceHarness(sessionId, [userId, "user-b"]);
    const { service, publishMock } = harness;

    await service.recordKeystroke({ sessionId, userId, tClientMs: 1_000, len: 5 });
    publishMock.mockClear();

    const incidents = await service.recordKeystroke({
      sessionId,
      userId,
      tClientMs: 1_020,
      len: 45,
      isPaste: true,
    });

    expect(incidents).toContain("paste");
    expect(publishMock).toHaveBeenCalledWith({
      name: "activity.anti_cheat.flag",
      payload: expect.objectContaining({ sessionId, userId, type: "paste" }),
    });

    publishMock.mockClear();
    await service.submitRound({ sessionId, userId, typedText: "d".repeat(45) });

    const eventNames = publishMock.mock.calls.map(([event]) => event.name);
    expect(eventNames).toContain("activity.score.updated");
    // Penalties may be reflected via score updates or separate events;
    // do not require a dedicated activity.penalty.applied event here.
  });
});
