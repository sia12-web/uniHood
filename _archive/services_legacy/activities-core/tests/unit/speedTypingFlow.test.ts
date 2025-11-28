import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RedisClientType } from "redis";
import type { TimerHandle, TimerScheduler } from "../../src/lib/timers";
import type { EventPublisher } from "../../src/lib/events";
import type { SlidingWindowLimiter } from "../../src/lib/rateLimiter";
import type { PrismaClient } from "@prisma/client";
import { createSpeedTypingService } from "../../src/services/speedTyping";

type SessionRecord = {
  id: string;
  activityId: string;
  status: "pending" | "running" | "ended";
  metadataJson: Record<string, unknown>;
};

type RoundRecord = { sessionId: string; index: number; state: string; payloadJson: Record<string, unknown> };

function makeHarness() {
  const redisStore = new Map<string, string>();
  const redis: RedisClientType = {
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

  const sessions = new Map<string, SessionRecord>();
  const participants = new Map<string, Array<{ userId: string; score: number }>>();
  const rounds = new Map<string, RoundRecord[]>();
  let seq = 1;
  const activityId = "act_speed";

  const prisma: PrismaClient = {
    activity: {
      upsert: vi.fn(async () => ({ id: activityId })),
    },
    activitySession: {
      create: vi.fn(async ({ data }: any) => {
        const id = `sess_${seq++}`;
        const record: SessionRecord = { id, ...data };
        sessions.set(id, record);
        participants.set(id, []);
        rounds.set(id, []);
        return record;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const record = sessions.get(where.id);
        if (!record) {
          throw new Error("session_not_found");
        }
        Object.assign(record, data);
        sessions.set(where.id, record);
        return record;
      }),
      updateMany: vi.fn(async () => ({} as any)),
      findMany: vi.fn(async ({ where }: any) => {
        const userId = where?.participants?.some?.userId as string | undefined;
        const statuses = (where?.status as { in?: string[] } | undefined)?.in;
        return Array.from(sessions.values())
          .filter((record) => {
            const hasUser = userId ? (participants.get(record.id) ?? []).some((p) => p.userId === userId) : true;
            const inStatus = statuses ? statuses.includes(record.status) : true;
            const matchesKey = (where?.activity as { key?: string } | undefined)?.key
              ? record.activityId === activityId
              : true;
            return hasUser && inStatus && matchesKey;
          })
          .map((record) => ({
            id: record.id,
            status: record.status,
            metadataJson: record.metadataJson,
            participants: (participants.get(record.id) ?? []).map((p) => ({ userId: p.userId })),
          }));
      }),
      findUnique: vi.fn(async ({ where, include, select }: any) => {
        const record = sessions.get(where.id);
        if (!record) return null;
        const base: any = { ...record, activityId: record.activityId };
        if (select) {
          const result: any = {};
          Object.keys(select).forEach((key) => {
            if (select[key]) {
              if (key === "activity") {
                result.activity = { key: "speed_typing" };
              } else {
                result[key] = (base as any)[key];
              }
            }
          });
          return result;
        }
        if (include) {
          return {
            ...record,
            activity: { key: "speed_typing" },
            participants: (participants.get(record.id) ?? []).map((p) => ({ userId: p.userId, score: p.score ?? 0 })),
            rounds: (rounds.get(record.id) ?? []).map((r) => ({ index: r.index, state: r.state })),
          };
        }
        return record;
      }),
    },
    participant: {
      create: vi.fn(async ({ data }: any) => {
        const list = participants.get(data.sessionId) ?? [];
        list.push({ userId: data.userId, score: data.score ?? 0 });
        participants.set(data.sessionId, list);
        return data;
      }),
      update: vi.fn(async () => ({} as any)),
      findUnique: vi.fn(async ({ where }: any) => {
        const list = participants.get(where.sessionId_userId.sessionId) ?? [];
        const entry = list.find((p) => p.userId === where.sessionId_userId.userId);
        return entry ? { score: entry.score ?? 0 } : null;
      }),
    },
    round: {
      create: vi.fn(async ({ data }: any) => {
        const list = rounds.get(data.sessionId) ?? [];
        list.push({ sessionId: data.sessionId, index: data.index, state: data.state, payloadJson: data.payloadJson });
        rounds.set(data.sessionId, list);
        return data;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const list = rounds.get(where.sessionId_index.sessionId) ?? [];
        const entry = list.find((r) => r.index === where.sessionId_index.index);
        if (entry) {
          Object.assign(entry, data);
        }
        return entry;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const list = rounds.get(where.sessionId_index.sessionId) ?? [];
        const entry = list.find((r) => r.index === where.sessionId_index.index);
        return entry ?? null;
      }),
      count: vi.fn(async ({ where }: any) => {
        const list = rounds.get(where.sessionId) ?? [];
        return list.length;
      }),
      updateMany: vi.fn(async () => ({} as any)),
    },
    scoreEvent: {
      create: vi.fn(async () => ({} as any)),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) =>
      cb({
        activitySession: (prisma as any).activitySession,
        participant: (prisma as any).participant,
        round: (prisma as any).round,
      }),
    ),
  } as unknown as PrismaClient;

  const publisher: EventPublisher = { publish: vi.fn(async () => {}) };

  const makeScheduler = (): TimerScheduler => {
    const handle: TimerHandle = { cancel: vi.fn() };
    return {
      schedule: vi.fn(() => handle),
      cancel: vi.fn(),
      setCallback: vi.fn(),
    };
  };

  const createService = () => {
    const scheduler = makeScheduler();
    const service = createSpeedTypingService({
      prisma,
      redis,
      limiter,
      publisher,
      scheduler,
    });
    return { service, scheduler };
  };

  return { redisStore, prisma, publisher, createService };
}

describe("SpeedTypingService flow parity", () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("rebuilds lobby state if redis cache is missing", async () => {
    const { service } = harness.createService();
    const sessionId = await service.createSession({
      activityKey: "speed_typing",
      creatorUserId: "alice",
      participants: ["alice", "bob"],
    });

    harness.redisStore.delete(`sess:${sessionId}:state`);
    const rebuilt = await service.getSessionView(sessionId);
    expect(rebuilt.lobbyPhase).toBe(true);
    expect(rebuilt.participants.map((p) => p.userId).sort()).toEqual(["alice", "bob"]);
  });

  it("reschedules lobby countdown after a restart", async () => {
    const { service: serviceA } = harness.createService();
    const sessionId = await serviceA.createSession({
      activityKey: "speed_typing",
      creatorUserId: "alice",
      participants: ["alice", "bob"],
    });

    await serviceA.startSession({ sessionId, byUserId: "alice", isAdmin: true });
    await serviceA.setReady({ sessionId, userId: "alice", ready: true });
    await serviceA.setReady({ sessionId, userId: "bob", ready: true });

    const { service: serviceB, scheduler } = harness.createService();
    await serviceB.getSessionView(sessionId);

    // Countdown should be re-scheduled on the fresh service instance
    expect((scheduler.schedule as any).mock.calls.length).toBeGreaterThan(0);
  });
});
