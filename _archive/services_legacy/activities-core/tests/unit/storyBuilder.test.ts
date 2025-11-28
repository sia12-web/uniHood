import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RedisClientType } from "redis";
import type { EventPublisher } from "../../src/lib/events";
import type { TimerHandle, TimerScheduler } from "../../src/lib/timers";
import { StoryBuilderService } from "../../src/services/storyBuilder";
import type { PrismaClient } from "@prisma/client";

type SessionRecord = {
  id: string;
  activityId: string;
  status: "pending" | "running" | "ended";
  metadataJson: Record<string, unknown>;
};

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

  const timerHandle: TimerHandle = { cancel: vi.fn() };
  const scheduler: TimerScheduler = {
    schedule: vi.fn(() => timerHandle),
    cancel: vi.fn(),
    setCallback: vi.fn(),
  };
  const publisher: EventPublisher = { publish: vi.fn(async () => {}) };

  const sessions = new Map<string, SessionRecord>();
  const participants = new Map<string, string[]>();
  const activityId = "act_story";
  let idSeq = 1;

  const prisma = {
    activity: {
      upsert: vi.fn(async () => ({ id: activityId })),
    },
    activitySession: {
      create: vi.fn(async ({ data }: any) => {
        const id = `sess_${idSeq++}`;
        const record: SessionRecord = { id, ...data };
        sessions.set(id, record);
        participants.set(id, []);
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
      findMany: vi.fn(async (args: any) => {
        const where = args?.where ?? {};
        const userId = where?.participants?.some?.userId as string | undefined;
        const statuses = (where?.status as { in?: string[] } | undefined)?.in;
        return Array.from(sessions.values())
          .filter((record) => {
            const inStatus = statuses ? statuses.includes(record.status) : true;
            const userList = participants.get(record.id) ?? [];
            const hasUser = userId ? userList.includes(userId) : true;
            const matchesKey = (where?.activity as { key?: string } | undefined)?.key
              ? record.activityId === activityId
              : true;
            return inStatus && hasUser && matchesKey;
          })
          .map((record) => ({
            id: record.id,
            status: record.status,
            metadataJson: record.metadataJson,
            participants: (participants.get(record.id) ?? []).map((userId) => ({ userId })),
          }));
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const record = sessions.get(where.id);
        if (!record) return null;
        return {
          ...record,
          activity: { key: "story_builder", configJson: record.metadataJson?.config ?? {} },
          participants: (participants.get(record.id) ?? []).map((userId) => ({ userId })),
        };
      }),
    },
    participant: {
      create: vi.fn(async ({ data }: any) => {
        const list = participants.get(data.sessionId) ?? [];
        list.push(data.userId);
        participants.set(data.sessionId, list);
        return data;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) =>
      cb({
        activitySession: {
          create: (payload: unknown) => (prisma as any).activitySession.create(payload),
        },
        participant: {
          create: (payload: unknown) => (prisma as any).participant.create(payload),
        },
      }),
    ),
  } as unknown as PrismaClient;

  const service = new StoryBuilderService(prisma, redis, publisher, scheduler);
  return { service, redisStore, publisher, scheduler, prisma, sessions, participants };
}

describe("StoryBuilderService", () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("creates sessions and can rebuild lobby state when redis state is missing", async () => {
    const sessionId = await harness.service.createSession({
      activityKey: "story_builder",
      creatorUserId: "alice",
      participants: ["alice", "bob"],
      config: { turns: 4, turnSeconds: 30, countdownMs: 1000 },
    });

    const view = await harness.service.getSessionView(sessionId);
    expect(view?.participants.map((p) => p.userId).sort()).toEqual(["alice", "bob"]);
    expect(view?.phase).toBe("lobby");

    harness.redisStore.delete(`story:${sessionId}:state`);
    const rebuilt = await harness.service.getSessionView(sessionId);
    expect(rebuilt?.phase).toBe("lobby");
    expect(rebuilt?.participants.map((p) => p.userId).sort()).toEqual(["alice", "bob"]);
  });

  it("moves through ready -> roles -> countdown -> running", async () => {
    const sessionId = await harness.service.createSession({
      activityKey: "story_builder",
      creatorUserId: "alice",
      participants: ["alice", "bob"],
      config: { turns: 2, turnSeconds: 10, countdownMs: 500 },
    });

    await harness.service.setReady({ sessionId, userId: "alice", ready: true });
    await harness.service.setReady({ sessionId, userId: "bob", ready: true });
    await harness.service.assignRole(sessionId, "alice", "girl");
    await harness.service.assignRole(sessionId, "bob", "boy");

    expect(harness.scheduler.schedule).toHaveBeenCalledTimes(1);
    const countdownView = await harness.service.getSessionView(sessionId);
    expect(countdownView?.phase).toBe("countdown");

    // Expire countdown to trigger auto start
    const key = `story:${sessionId}:state`;
    const state = JSON.parse(harness.redisStore.get(key) ?? "{}");
    state.countdown.endsAt = Date.now() - 10;
    harness.redisStore.set(key, JSON.stringify(state));

    const runningView = await harness.service.getSessionView(sessionId);
    expect(runningView?.phase).toBe("running");
    expect(runningView?.meta?.scenario).toBeTruthy();
  });

  it("lists sessions even if the cached state vanished", async () => {
    const sessionId = await harness.service.createSession({
      activityKey: "story_builder",
      creatorUserId: "alice",
      participants: ["alice", "bob"],
    });
    harness.redisStore.delete(`story:${sessionId}:state`);

    const summaries = await harness.service.listSessionsForUser({ userId: "bob", statuses: ["pending"] });
    expect(summaries.find((s) => s.id === sessionId)).toBeTruthy();
    expect(summaries.find((s) => s.id === sessionId)?.phase).toBe("lobby");
  });
});
