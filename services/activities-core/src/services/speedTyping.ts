import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { RedisClientType } from "redis";
import { SlidingWindowLimiter, RateLimitExceededError } from "../lib/rateLimiter";
import { EventPublisher } from "../lib/events";
import { defaultSpeedTypingConfig, SpeedTypingConfig } from "../lib/config";
import { TimerHandle, TimerScheduler } from "../lib/timers";
import { getRandomTextSample } from "../lib/textBank";
import type {
  CreateSessionDto,
  ScoreboardView,
  SessionView,
  RoundView,
} from "../dto/sessionDtos";
import { computeTypingMetricsV2, TypingMetricsV2, KeystrokeSample } from "../lib/metrics";
import {
  IncidentRecord,
  IncidentType,
  mergeIncidentTypes,
  normalizeClientTime,
  recordKeystrokeSample,
  updateSkewEstimate,
} from "../lib/antiCheat";

interface LobbyPresence {
  joined: boolean;
  ready: boolean;
  lastSeen: number;
}

interface CountdownState {
  startedAt: number;
  durationMs: number;
  endsAt: number;
}

interface SessionState {
  phase: "lobby" | "countdown" | "running";
  currentRound: number;
  cfg: SpeedTypingConfig;
  submissions: Record<number, Record<string, SubmissionSnapshot>>;
  participants: string[];
  creatorUserId: string;
  totalRounds: number;
  skewMsEstimate: Record<string, number>;
  keystrokes: Record<number, Record<string, KeystrokeSample[]>>;
  incidents: Record<number, Record<string, IncidentRecord[]>>;
  roundDeadlines: Record<number, number>;
  presence: Record<string, LobbyPresence>;
  lobbyReady: boolean;
  countdown?: CountdownState;
  lastActivityMs?: number;
}

interface SubmissionSnapshot {
  delta: number;
  metrics: TypingMetricsV2;
  incidents: IncidentType[];
}

interface Dependencies {
  prisma: PrismaClient;
  redis: RedisClientType;
  limiter: SlidingWindowLimiter;
  publisher: EventPublisher;
  scheduler: TimerScheduler;
}

const SESSION_STATE_KEY = (sessionId: string) => `sess:${sessionId}:state`;

export type CreateSessionParams = CreateSessionDto;

export interface StartSessionParams {
  sessionId: string;
  byUserId: string;
  isAdmin: boolean;
}

export interface SubmitRoundParams {
  sessionId: string;
  userId: string;
  typedText: string;
  clientMs?: number;
}

export interface RecordKeystrokeParams {
  sessionId: string;
  userId: string;
  tClientMs: number;
  len: number;
  isPaste?: boolean;
}

export interface UpdateSkewParams {
  sessionId: string;
  userId: string;
  tClientMs: number;
  serverNow: number;
}

export interface SpeedTypingService {
  createSession(params: CreateSessionParams): Promise<string>;
  startSession(params: StartSessionParams): Promise<void>;
  submitRound(params: SubmitRoundParams): Promise<void>;
  getSessionView(sessionId: string): Promise<SessionView>;
  listSessionsForUser(params: { userId: string; statuses?: Array<"pending" | "running" | "ended"> }): Promise<{
    id: string;
    activityKey: "speed_typing";
    status: "pending" | "running" | "ended";
    phase: "lobby" | "countdown" | "running" | "ended";
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
  }[]>;
  handleTimerElapsed(sessionId: string, roundIndex: number): Promise<void>;
  recordKeystroke(params: RecordKeystrokeParams): Promise<IncidentType[]>;
  updateSkewEstimate(params: UpdateSkewParams): Promise<number>;
  joinSession(params: { sessionId: string; userId: string }): Promise<void>;
  leaveSession(params: { sessionId: string; userId: string }): Promise<void>;
  setReady(params: { sessionId: string; userId: string; ready: boolean }): Promise<void>;
}

export function createSpeedTypingService(deps: Dependencies): SpeedTypingService {
  const { prisma, redis, limiter, publisher, scheduler } = deps;
  const timerHandles = new Map<string, TimerHandle>();
  const inactivityHandles = new Map<string, TimerHandle>();
  const LOBBY_COUNTDOWN_MS = 10_000;
  const INACTIVITY_MS = 120_000; // 2 minutes

  async function ensureActivity(): Promise<string> {
    const config = defaultSpeedTypingConfig();
    const activity = await prisma.activity.upsert({
      where: { key: "speed_typing" },
      update: {},
      create: {
        key: "speed_typing",
        name: "Who Types Faster",
        // Cast config to JsonObject to satisfy Prisma's InputJsonValue expectations.
        configJson: config as unknown as Prisma.JsonObject,
      },
    });
    return activity.id;
  }

  async function endExistingSessions(activityId: string): Promise<void> {
    const sessions = await prisma.activitySession.findMany({
      where: { activityId, status: { in: ["pending", "running"] } },
      select: { id: true },
    });
    if (sessions.length === 0) return;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.activitySession.updateMany({
        where: { activityId, status: { in: ["pending", "running"] } },
        data: { status: "ended", endedAt: new Date() },
      });
      await tx.round.updateMany({
        where: { session: { activityId } },
        data: { state: "done", endedAt: new Date() },
      });
    });
    await Promise.all(sessions.map((s) => deleteState(s.id)));
  }

  async function loadState(sessionId: string): Promise<SessionState | null> {
    const raw = await redis.get(SESSION_STATE_KEY(sessionId));
    return raw ? (JSON.parse(raw) as SessionState) : null;
  }

  async function saveState(sessionId: string, state: SessionState): Promise<void> {
    await redis.set(SESSION_STATE_KEY(sessionId), JSON.stringify(state));
  }

  async function deleteState(sessionId: string): Promise<void> {
    await redis.del(SESSION_STATE_KEY(sessionId));
  }

  async function listSessionsForUser(params: { userId: string; statuses?: Array<"pending" | "running" | "ended"> }): Promise<{
    id: string;
    activityKey: "speed_typing";
    status: "pending" | "running" | "ended";
    phase: "lobby" | "countdown" | "running" | "ended";
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
  }[]> {
    const statuses = params.statuses && params.statuses.length > 0 ? params.statuses : undefined;
    const sessions = await prisma.activitySession.findMany({
      where: {
        activity: { key: "speed_typing" },
        participants: { some: { userId: params.userId } },
        status: statuses ? { in: statuses } : undefined,
      },
      orderBy: { id: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        metadataJson: true,
        participants: { select: { userId: true }, orderBy: { joinedAt: "asc" } },
      },
    });

    const results: Array<{
      id: string;
      activityKey: "speed_typing";
      status: "pending" | "running" | "ended";
      phase: "lobby" | "countdown" | "running" | "ended";
      lobbyReady: boolean;
      creatorUserId: string;
      participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
    }> = [];

    for (const session of sessions) {
      const state = await loadState(session.id);
      const fallbackPresence = Object.fromEntries(
        session.participants.map((participant) => [participant.userId, { joined: false, ready: false, lastSeen: 0 } as LobbyPresence]),
      );
      const presence = state?.presence ?? fallbackPresence;
      const creatorFromState = state?.creatorUserId;
      const metadata = session.metadataJson as { creatorUserId?: string } | null;
      const creatorUserId = creatorFromState ?? metadata?.creatorUserId ?? params.userId;

      results.push({
        id: session.id,
        activityKey: "speed_typing",
        status: session.status as "pending" | "running" | "ended",
        phase:
          state?.phase ??
          (session.status === "pending"
            ? "lobby"
            : session.status === "running"
            ? "running"
            : "ended"),
        lobbyReady: state?.lobbyReady ?? false,
        creatorUserId,
        participants: session.participants.map((participant) => ({
          userId: participant.userId,
          joined: presence[participant.userId]?.joined ?? false,
          ready: presence[participant.userId]?.ready ?? false,
        })),
      });
    }

    return results;
  }

  function scheduleTimer(sessionId: string, roundIndex: number, delayMs: number): void {
    timerHandles.get(sessionId)?.cancel();
    const handle = scheduler.schedule(sessionId, roundIndex, delayMs);
    timerHandles.set(sessionId, handle);
  }

  function cancelTimer(sessionId: string): void {
    timerHandles.get(sessionId)?.cancel();
    timerHandles.delete(sessionId);
    scheduler.cancel(sessionId);
  }

  function cancelInactivityTimer(sessionId: string): void {
    inactivityHandles.get(sessionId)?.cancel();
    inactivityHandles.delete(sessionId);
    // share scheduler; cancel called above in cancelTimer; here we don't cancel scheduler to avoid breaking round timer
  }

  function scheduleInactivity(sessionId: string): void {
    cancelInactivityTimer(sessionId);
    const handle = scheduler.schedule(sessionId, -2, INACTIVITY_MS);
    inactivityHandles.set(sessionId, handle);
  }

  function ensurePresence(state: SessionState, userId: string): LobbyPresence {
    if (!state.presence[userId]) {
      state.presence[userId] = { joined: false, ready: false, lastSeen: 0 };
    }
    return state.presence[userId];
  }

  function everyoneReady(state: SessionState): boolean {
    return state.participants.every((userId) => {
      const presence = state.presence[userId];
      return Boolean(presence?.joined) && Boolean(presence?.ready);
    });
  }

  async function emitPresence(sessionId: string, state: SessionState): Promise<void> {
    await publisher.publish({
      name: "activity.session.presence",
      payload: {
        sessionId,
        participants: state.participants.map((userId) => {
          const presence = state.presence[userId] ?? { joined: false, ready: false };
          return {
            userId,
            joined: presence.joined,
            ready: presence.ready,
          };
        }),
        lobbyReady: state.lobbyReady,
        phase: state.phase,
      },
    });
  }

  async function cancelCountdown(sessionId: string, state: SessionState, reason: string): Promise<void> {
    if (state.phase !== "countdown") {
      return;
    }
    cancelTimer(sessionId);
    state.phase = "lobby";
    state.countdown = undefined;
    await saveState(sessionId, state);
    await publisher.publish({
      name: "activity.session.countdown.cancelled",
      payload: { sessionId, reason },
    });
    await emitPresence(sessionId, state);
  }

  async function startCountdown(sessionId: string, state: SessionState): Promise<void> {
    const now = Date.now();
    state.phase = "countdown";
    state.countdown = {
      startedAt: now,
      durationMs: LOBBY_COUNTDOWN_MS,
      endsAt: now + LOBBY_COUNTDOWN_MS,
    };
    await saveState(sessionId, state);
    scheduleTimer(sessionId, -1, LOBBY_COUNTDOWN_MS);
    await publisher.publish({
      name: "activity.session.countdown",
      payload: {
        sessionId,
        startedAt: state.countdown.startedAt,
        durationMs: state.countdown.durationMs,
        endsAt: state.countdown.endsAt,
      },
    });
    await emitPresence(sessionId, state);
  }

  async function maybeStartCountdown(sessionId: string, state: SessionState): Promise<void> {
    if (!state.lobbyReady) {
      return;
    }
    if (state.phase !== "lobby") {
      return;
    }
    if (!everyoneReady(state)) {
      return;
    }
    await startCountdown(sessionId, state);
  }

  async function beginFirstRound(sessionId: string, state: SessionState): Promise<void> {
    const config = state.cfg ?? defaultSpeedTypingConfig();
    state.phase = "running";
    state.countdown = undefined;
    state.currentRound = 0;
    state.submissions = {};
    ensureRoundBuckets(state, 0);
    state.roundDeadlines[0] = Date.now() + config.timeLimitMs;
    state.lastActivityMs = Date.now();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.activitySession.update({
        where: { id: sessionId },
        data: {
          status: "running",
          startedAt: new Date(),
        },
      });
      await tx.round.update({
        where: { sessionId_index: { sessionId, index: 0 } },
        data: {
          state: "running",
          startedAt: new Date(),
        },
      });
    });

    await saveState(sessionId, state);
    scheduleTimer(sessionId, 0, config.timeLimitMs);
    scheduleInactivity(sessionId);

    await publisher.publish({
      name: "activity.session.started",
      payload: { sessionId, currentRound: 0 },
    });

    const payload = await getRoundPayload(sessionId, 0);
    await publisher.publish({
      name: "activity.round.started",
      payload: { sessionId, index: 0, payload },
    });
  }

  async function buildRounds(config: SpeedTypingConfig): Promise<Array<{ textSample: string; timeLimitMs: number }>> {
    const rounds: Array<{ textSample: string; timeLimitMs: number }> = [];
    for (let i = 0; i < config.rounds; i += 1) {
      const sample = pickText(config.textLen.min, config.textLen.max);
      rounds.push({ textSample: sample, timeLimitMs: config.timeLimitMs });
    }
    return rounds;
  }

  function pickText(min: number, max: number): string {
    const candidates: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const text = getRandomTextSample();
      if (text.length >= min && text.length <= max) {
        candidates.push(text);
      }
    }
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return getRandomTextSample();
  }

  async function getScoreboard(sessionId: string): Promise<ScoreboardView> {
    const participants = await prisma.participant.findMany({
      where: { sessionId },
      select: { userId: true, score: true },
      orderBy: { score: "desc" },
    });
    const lastDelta = await prisma.scoreEvent.findFirst({
      where: { sessionId },
      orderBy: { at: "desc" },
      select: { userId: true, delta: true },
    });
    return {
      participants,
      lastDelta: lastDelta ?? undefined,
    };
  }

  async function getRoundPayload(sessionId: string, roundIndex: number): Promise<RoundView["payload"] | null> {
    const round = await prisma.round.findUnique({
      where: { sessionId_index: { sessionId, index: roundIndex } },
      select: { payloadJson: true },
    });
    return (round?.payloadJson as RoundView["payload"] | null) ?? null;
  }

  function assertState(state: SessionState | null, sessionId: string): asserts state is SessionState {
    if (!state) {
      throw new Error(`session_state_missing:${sessionId}`);
    }
  }

  function ensureRoundBuckets(state: SessionState, roundIndex: number): void {
    if (!state.keystrokes[roundIndex]) {
      state.keystrokes[roundIndex] = {};
    }
    if (!state.incidents[roundIndex]) {
      state.incidents[roundIndex] = {};
    }
    if (!state.submissions[roundIndex]) {
      state.submissions[roundIndex] = {};
    }
  }

  async function persistRoundIncidents(sessionId: string, roundIndex: number, state: SessionState): Promise<void> {
    const incidentsForRound = state.incidents[roundIndex];
    if (!incidentsForRound) {
      return;
    }

    const rows: Array<Prisma.AntiCheatEventCreateManyInput> = [];
    for (const [userId, incidents] of Object.entries(incidentsForRound)) {
      for (const incident of incidents) {
        rows.push({
          sessionId,
          roundIndex,
          userId,
            type: incident.type,
            // Ensure detail object conforms to Prisma JSON type (convert or cast).
            metaJson: incident.detail ? (incident.detail as unknown as Prisma.JsonObject) : undefined,
        });
      }
    }

    if (rows.length === 0) {
      return;
    }

    await prisma.antiCheatEvent.createMany({ data: rows });
  }

  async function createSession(params: CreateSessionParams): Promise<string> {
    if (params.activityKey !== "speed_typing") {
      throw new Error("unsupported_activity");
    }
    const uniqueParticipants = new Set(params.participants);
    if (uniqueParticipants.size !== 2) {
      throw new Error("invalid_participants");
    }

    const activityId = await ensureActivity();
    await endExistingSessions(activityId); // enforce single active speed typing session
    const config = { ...defaultSpeedTypingConfig(), rounds: 1 }; // single round duel

  const session = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.activitySession.create({
        data: {
          activityId,
          status: "pending",
          metadataJson: { creatorUserId: params.creatorUserId },
        },
      });

      await Promise.all(
  params.participants.map((userId: string) =>
          tx.participant.create({
            data: {
              sessionId: created.id,
              userId,
            },
          }),
        ),
      );

      return created;
    });

    const state: SessionState = {
      phase: "lobby",
      currentRound: -1,
      cfg: config,
      submissions: {},
      participants: params.participants,
      creatorUserId: params.creatorUserId,
      totalRounds: config.rounds,
      skewMsEstimate: {},
      keystrokes: {},
      incidents: {},
      roundDeadlines: {},
      presence: Object.fromEntries(
        params.participants.map((userId: string) => [userId, { joined: false, ready: false, lastSeen: 0 }]),
      ),
      lobbyReady: false,
    };
    await saveState(session.id, state);

    await publisher.publish({
      name: "activity.session.created",
      payload: { sessionId: session.id },
    });

    return session.id;
  }

  async function joinSession(params: { sessionId: string; userId: string }): Promise<void> {
    const state = await loadState(params.sessionId);
    assertState(state, params.sessionId);
    if (!state.participants.includes(params.userId)) {
      throw new Error("participant_not_in_session");
    }
    const presence = ensurePresence(state, params.userId);
    const now = Date.now();
    presence.joined = true;
    presence.lastSeen = now;
    await saveState(params.sessionId, state);
    if (state.phase === "countdown" && !everyoneReady(state)) {
      await cancelCountdown(params.sessionId, state, "participant_rejoined");
    } else {
      await emitPresence(params.sessionId, state);
    }
  }

  async function leaveSession(params: { sessionId: string; userId: string }): Promise<void> {
    const state = await loadState(params.sessionId);
    assertState(state, params.sessionId);
    if (!state.participants.includes(params.userId)) {
      return;
    }
    const presence = ensurePresence(state, params.userId);
    presence.joined = false;
    presence.ready = false;
    presence.lastSeen = Date.now();
    await saveState(params.sessionId, state);
    if (state.phase === "countdown") {
      await cancelCountdown(params.sessionId, state, "participant_left");
    } else {
      await emitPresence(params.sessionId, state);
    }
  }

  async function setReady(params: { sessionId: string; userId: string; ready: boolean }): Promise<void> {
    const state = await loadState(params.sessionId);
    assertState(state, params.sessionId);
    if (!state.participants.includes(params.userId)) {
      throw new Error("participant_not_in_session");
    }
    if (state.phase === "running") {
      return;
    }
    const presence = ensurePresence(state, params.userId);
    if (!presence.joined) {
      presence.joined = true;
    }
    presence.ready = params.ready;
    presence.lastSeen = Date.now();
    await saveState(params.sessionId, state);
    if (!params.ready && state.phase === "countdown") {
      await cancelCountdown(params.sessionId, state, "participant_unready");
      return;
    }

    await maybeStartCountdown(params.sessionId, state);
    if (state.phase === "lobby") {
      await emitPresence(params.sessionId, state);
    }
  }

  async function startSession(params: StartSessionParams): Promise<void> {
    const session = await prisma.activitySession.findUnique({
      where: { id: params.sessionId },
      select: {
        id: true,
        status: true,
        metadataJson: true,
      },
    });
    if (!session) {
      throw new Error("session_not_found");
    }
    const creatorUserId = (session.metadataJson as { creatorUserId?: string } | null)?.creatorUserId;
    if (!params.isAdmin && params.byUserId !== creatorUserId) {
      throw new Error("forbidden");
    }

    const state = await loadState(params.sessionId);
    assertState(state, params.sessionId);
    if (state.phase !== "lobby" && state.phase !== "countdown") {
      throw new Error("session_not_in_lobby");
    }

    const config = state.cfg ?? defaultSpeedTypingConfig();

    const existingRounds = await prisma.round.count({ where: { sessionId: params.sessionId } });
    if (existingRounds === 0) {
      const rounds = await buildRounds(config);
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (let index = 0; index < rounds.length; index += 1) {
          await tx.round.create({
            data: {
              sessionId: params.sessionId,
              index,
              state: "queued",
              payloadJson: rounds[index],
            },
          });
        }
      });
      state.totalRounds = rounds.length;
    } else {
      state.totalRounds = existingRounds;
    }

    state.lobbyReady = true;
    if (state.phase === "countdown") {
      state.phase = "lobby";
      state.countdown = undefined;
    }

    await saveState(params.sessionId, state);
    await emitPresence(params.sessionId, state);
    await maybeStartCountdown(params.sessionId, state);
  }

  async function submitRound(params: SubmitRoundParams): Promise<void> {
    try {
      await limiter.check(`submit:${params.sessionId}:${params.userId}`, 5, 2_000);
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        throw error;
      }
      throw new Error("rate_limit_error");
    }

    const state = await loadState(params.sessionId);
    assertState(state, params.sessionId);
    if (state.phase !== "running") {
      throw new Error("session_not_running");
    }
    const roundIndex = state.currentRound;
    if (roundIndex < 0) {
      throw new Error("round_not_started");
    }

    const round = await prisma.round.findUnique({
      where: { sessionId_index: { sessionId: params.sessionId, index: roundIndex } },
    });
    if (!round) {
      throw new Error("round_not_found");
    }

    if (round.state === "done") {
      return; // already processed
    }

    ensureRoundBuckets(state, roundIndex);

    if (state.submissions[roundIndex][params.userId]) {
      return; // duplicate submission ignored
    }

    if (round.state === "queued") {
      await prisma.round.update({
        where: { sessionId_index: { sessionId: params.sessionId, index: roundIndex } },
        data: { state: "running", startedAt: new Date() },
      });
    }

    const payload = round.payloadJson as { textSample: string; timeLimitMs: number };

    const keystrokesForRound = state.keystrokes[roundIndex];
    const incidentsForRound = state.incidents[roundIndex];
    let userKeystrokes = keystrokesForRound[params.userId] ?? [];
    if (!keystrokesForRound[params.userId]) {
      keystrokesForRound[params.userId] = userKeystrokes;
    }

    let incidentsForUser = incidentsForRound[params.userId] ?? [];
    if (!incidentsForRound[params.userId]) {
      incidentsForRound[params.userId] = incidentsForUser;
    }

    const lastSample = userKeystrokes[userKeystrokes.length - 1];
    if (!lastSample || lastSample.len !== params.typedText.length) {
      const { samples: updatedSamples, incidents } = recordKeystrokeSample(
        userKeystrokes,
        incidentsForUser,
        {
          t: Date.now(),
          len: params.typedText.length,
        },
        state.roundDeadlines[roundIndex],
      );
      userKeystrokes = updatedSamples;
      incidentsForUser = incidents;
      keystrokesForRound[params.userId] = updatedSamples;
      incidentsForRound[params.userId] = incidents;
    }
    const incidentTypes = mergeIncidentTypes(incidentsForUser).filter((type) => type !== "late_input");

    const metrics: TypingMetricsV2 = computeTypingMetricsV2(
      payload.textSample,
      params.typedText,
      userKeystrokes,
      state.roundDeadlines[roundIndex],
      payload.timeLimitMs,
    );
    const durationMs = (metrics as any).durationMs ?? payload.timeLimitMs;
    const speedBonus = Math.max(0, Math.floor((payload.timeLimitMs - durationMs) / 1000));
    const isPerfect = (metrics as any).accuracy === 1 || (metrics as any).accuracyPct === 100;
    const delta = isPerfect ? 100 + speedBonus : -25;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.scoreEvent.create({
        data: {
          sessionId: params.sessionId,
          userId: params.userId,
          delta,
          reason: "round",
        },
      });
      await tx.participant.update({
        where: { sessionId_userId: { sessionId: params.sessionId, userId: params.userId } },
        data: { score: { increment: delta } },
      });
    });

    const updatedParticipant = await prisma.participant.findUnique({
      where: { sessionId_userId: { sessionId: params.sessionId, userId: params.userId } },
      select: { score: true },
    });

    state.submissions[roundIndex][params.userId] = {
      delta,
      metrics,
      incidents: incidentTypes,
    };
    state.lastActivityMs = Date.now();
    await saveState(params.sessionId, state);
    scheduleInactivity(params.sessionId);

    await publisher.publish({
      name: "activity.score.updated",
      payload: {
        sessionId: params.sessionId,
        userId: params.userId,
        delta,
        total: updatedParticipant?.score ?? 0,
      },
    });

    const allSubmitted = state.participants.every((userId: string) => Boolean(state.submissions[roundIndex][userId]));
    if (isPerfect || allSubmitted) {
      await endRound(params.sessionId, roundIndex, state);
    }
  }

  async function endRound(sessionId: string, roundIndex: number, state?: SessionState | null): Promise<void> {
    const currentState = state ?? (await loadState(sessionId));
    assertState(currentState, sessionId);

    cancelTimer(sessionId);

    await prisma.round.update({
      where: { sessionId_index: { sessionId, index: roundIndex } },
      data: { state: "done", endedAt: new Date() },
    });

    await persistRoundIncidents(sessionId, roundIndex, currentState);

    delete currentState.keystrokes[roundIndex];
    delete currentState.incidents[roundIndex];
    delete currentState.roundDeadlines[roundIndex];

    const scoreboard = await getScoreboard(sessionId);
    await publisher.publish({
      name: "activity.round.ended",
      payload: { sessionId, index: roundIndex, scoreboard },
    });

    const nextRound = roundIndex + 1;
    if (nextRound < currentState.totalRounds) {
      currentState.currentRound = nextRound;
      currentState.submissions[nextRound] = {};
      await prisma.round.update({
        where: { sessionId_index: { sessionId, index: nextRound } },
        data: { state: "running", startedAt: new Date() },
      });
      ensureRoundBuckets(currentState, nextRound);
      currentState.roundDeadlines[nextRound] = Date.now() + currentState.cfg.timeLimitMs;
      await saveState(sessionId, currentState);

      const payload = await getRoundPayload(sessionId, nextRound);
      await publisher.publish({
        name: "activity.round.started",
        payload: { sessionId, index: nextRound, payload },
      });
      scheduleTimer(sessionId, nextRound, currentState.cfg.timeLimitMs);
      scheduleInactivity(sessionId);
    } else {
      await prisma.activitySession.update({
        where: { id: sessionId },
        data: { status: "ended", endedAt: new Date() },
      });
      await publisher.publish({
        name: "activity.session.ended",
        payload: { sessionId, finalScoreboard: scoreboard, winnerUserId: scoreboard.participants[0]?.userId },
      });
      cancelInactivityTimer(sessionId);
      await deleteState(sessionId);
    }
  }

  async function getSessionView(sessionId: string): Promise<SessionView> {
    const session = await prisma.activitySession.findUnique({
      where: { id: sessionId },
      include: {
        activity: { select: { key: true } },
        participants: { select: { userId: true, score: true }, orderBy: { joinedAt: "asc" } },
        rounds: { select: { index: true, state: true }, orderBy: { index: "asc" } },
      },
    });
    if (!session) {
      throw new Error("session_not_found");
    }
    // Guard: if this session belongs to a different activity, treat as not found
    if (session.activity.key !== "speed_typing") {
      throw new Error("session_not_found");
    }

    const state = await loadState(sessionId);

    return {
      id: sessionId,
      status: session.status as SessionView["status"],
      activityKey: "speed_typing",
      participants: session.participants.map((participant: { userId: string; score: number }) => ({
        userId: participant.userId,
        score: participant.score,
      })),
      currentRoundIndex: state?.phase === "running" ? state.currentRound : undefined,
      rounds: session.rounds.map((roundItem: { index: number; state: string }) => ({
        index: roundItem.index,
        state: roundItem.state as RoundView["state"],
      })),
      lobbyPhase: state ? state.phase !== "running" : session.status !== "running",
      lobbyReady: state?.lobbyReady ?? false,
      presence: state
        ? state.participants.map((userId) => {
            const presence = state.presence[userId] ?? { joined: false, ready: false };
            return {
              userId,
              joined: presence.joined,
              ready: presence.ready,
            };
          })
        : undefined,
      countdown: state?.countdown,
    };
  }

  async function handleTimerElapsed(sessionId: string, roundIndex: number): Promise<void> {
    const state = await loadState(sessionId);
    if (!state) {
      return;
    }
    if (roundIndex === -2) {
      if (state.phase === "running" && (!state.lastActivityMs || Date.now() - state.lastActivityMs >= INACTIVITY_MS)) {
        // End session as draw due to inactivity
        await prisma.activitySession.update({
          where: { id: sessionId },
          data: { status: "ended", endedAt: new Date() },
        });
        const scoreboard = await getScoreboard(sessionId);
        await publisher.publish({
          name: "activity.session.ended",
          payload: { sessionId, finalScoreboard: scoreboard, winnerUserId: undefined, draw: true },
        });
        await deleteState(sessionId);
        cancelTimer(sessionId);
        cancelInactivityTimer(sessionId);
      }
      return;
    }
    if (roundIndex === -1) {
      if (state.phase !== "countdown") {
        return;
      }
      if (!state.lobbyReady || !everyoneReady(state)) {
        await cancelCountdown(sessionId, state, "countdown_stale");
        return;
      }
      await beginFirstRound(sessionId, state);
      return;
    }
    if (state.phase !== "running" || state.currentRound !== roundIndex) {
      return;
    }
    await endRound(sessionId, roundIndex, state);
  }

  async function recordKeystroke(params: RecordKeystrokeParams): Promise<IncidentType[]> {
    const state = await loadState(params.sessionId);
    if (!state || state.phase !== "running" || state.currentRound < 0) {
      return [];
    }

    const roundIndex = state.currentRound;
    ensureRoundBuckets(state, roundIndex);
    if (!state.roundDeadlines[roundIndex]) {
      state.roundDeadlines[roundIndex] = Date.now() + state.cfg.timeLimitMs;
    }

  const skew = state.skewMsEstimate[params.userId];
  const normalizedCandidate = normalizeClientTime(params.tClientMs, skew);
  const normalizedTime = Number.isFinite(normalizedCandidate) ? normalizedCandidate : Date.now();
    const samples = state.keystrokes[roundIndex][params.userId];

    const lastSample = samples?.at(-1);
    const monotonicTime = lastSample ? Math.max(normalizedTime, lastSample.t + 1) : normalizedTime;
    const sample: KeystrokeSample = {
      t: monotonicTime,
      len: params.len,
      isPaste: params.isPaste,
    };

    const existingSamples = state.keystrokes[roundIndex][params.userId];
    const existingIncidents = state.incidents[roundIndex][params.userId];

    const { samples: updatedSamples, incidents, newIncidents } = recordKeystrokeSample(
      existingSamples,
      existingIncidents,
      sample,
      state.roundDeadlines[roundIndex],
    );

    state.keystrokes[roundIndex][params.userId] = updatedSamples;
    state.incidents[roundIndex][params.userId] = incidents;
    state.lastActivityMs = Date.now();

    await saveState(params.sessionId, state);
    scheduleInactivity(params.sessionId);

    if (newIncidents.length > 0) {
      await Promise.all(
        newIncidents.map((incident) =>
          publisher.publish({
            name: "activity.anti_cheat.flag",
            payload: {
              sessionId: params.sessionId,
              userId: params.userId,
              type: incident.type,
              detail: incident.detail,
            },
          }),
        ),
      );
    }

    return newIncidents.map((incident) => incident.type);
  }

  async function updateSkew(params: UpdateSkewParams): Promise<number> {
    const state = await loadState(params.sessionId);
    assertState(state, params.sessionId);

    const sample = params.serverNow - params.tClientMs;
    const next = updateSkewEstimate(state.skewMsEstimate[params.userId], sample);
    state.skewMsEstimate[params.userId] = next;
    await saveState(params.sessionId, state);
    return next;
  }

  return {
    createSession,
    startSession,
    submitRound,
    getSessionView,
    listSessionsForUser,
    handleTimerElapsed,
    recordKeystroke,
    updateSkewEstimate: updateSkew,
    joinSession,
    leaveSession,
    setReady,
  };
}
