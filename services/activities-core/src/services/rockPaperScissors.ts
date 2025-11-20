import { PrismaClient, Prisma } from "@prisma/client";
import type { RedisClientType } from "redis";
import type { SlidingWindowLimiter } from "../lib/rateLimiter";
import { RateLimitExceededError } from "../lib/rateLimiter";
import type { EventPublisher } from "../lib/events";
import type { TimerScheduler, TimerHandle } from "../lib/timers";
import type {
  CreateRpsSessionDto,
  ScoreboardView,
} from "../dto/sessionDtos";

type Move = "rock" | "paper" | "scissors";

interface LobbyPresence {
  joined: boolean;
  ready: boolean;
  lastSeen: number;
}

interface CountdownState {
  startedAt: number;
  durationMs: number;
  endsAt: number;
  reason?: "lobby";
}

interface SessionState {
  phase: "lobby" | "countdown" | "running" | "ended";
  currentRound: number;
  totalRounds: number;
  cfg: RpsConfig;
  participants: string[];
  creatorUserId: string;
  presence: Record<string, LobbyPresence>;
  lobbyReady: boolean;
  countdown?: CountdownState;
  moves: Record<number, Record<string, Move | null>>;
  score: Record<string, number>;
  lastActivityMs?: number;
}

interface RpsConfig {
  rounds: number;
  roundTimeMs: number;
  countdownMs: number;
}

interface Dependencies {
  prisma: PrismaClient;
  redis: RedisClientType;
  limiter: SlidingWindowLimiter;
  publisher: EventPublisher;
  scheduler: TimerScheduler;
}

const SESSION_STATE_KEY = (sessionId: string) => `rps:sess:${sessionId}:state`;
const DEFAULT_CONFIG: RpsConfig = { rounds: 3, roundTimeMs: 10_000, countdownMs: 5_000 };
const LOBBY_IDLE_MS = 10 * 60_000;
const lobbyExpiryHandles = new Map<string, ReturnType<typeof setTimeout>>();
const INACTIVITY_MS = 60_000;

export interface CreateRpsSessionParams extends CreateRpsSessionDto {}
export interface StartRpsSessionParams { sessionId: string; byUserId: string; isAdmin: boolean; }
export interface SubmitRpsMoveParams { sessionId: string; userId: string; move: Move; }

export interface RockPaperScissorsLobbySummary {
  id: string;
  activityKey: "rock_paper_scissors";
  status: "pending" | "running" | "ended";
  phase: "lobby" | "countdown" | "running" | "ended";
  lobbyReady: boolean;
  creatorUserId: string;
  participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
  countdown?: CountdownState;
  expiresAt?: number;
}

export interface RockPaperScissorsService {
  createSession(params: CreateRpsSessionParams): Promise<string>;
  listSessionsForUser(params: { userId: string; statuses?: Array<"pending" | "running" | "ended"> }): Promise<RockPaperScissorsLobbySummary[]>;
  startSession(params: StartRpsSessionParams): Promise<void>;
  submitMove(params: SubmitRpsMoveParams): Promise<void>;
  getSessionView(sessionId: string): Promise<unknown>;
  handleTimerElapsed(sessionId: string, roundIndex: number): Promise<void>;
  joinSession(params: { sessionId: string; userId: string }): Promise<void>;
  leaveSession(params: { sessionId: string; userId: string }): Promise<void>;
  setReady(params: { sessionId: string; userId: string; ready: boolean }): Promise<void>;
}

function mergeConfig(input?: Partial<RpsConfig>): RpsConfig {
  const targetRounds = typeof input?.rounds === "number" ? Math.max(1, Math.min(input.rounds, 9)) : DEFAULT_CONFIG.rounds;
  const roundTimeMs =
    typeof input?.roundTimeMs === "number" ? Math.max(3_000, Math.min(input.roundTimeMs, 20_000)) : DEFAULT_CONFIG.roundTimeMs;
  const countdownMs =
    typeof input?.countdownMs === "number" ? Math.max(2_000, Math.min(input.countdownMs, 15_000)) : DEFAULT_CONFIG.countdownMs;
  return {
    rounds: targetRounds,
    roundTimeMs,
    countdownMs,
  };
}

export function createRockPaperScissorsService(deps: Dependencies): RockPaperScissorsService {
  const { prisma, redis, limiter, publisher, scheduler } = deps;
  const timerHandles = new Map<string, TimerHandle>();
  const inactivityHandles = new Map<string, TimerHandle>();

  async function ensureActivity(config: RpsConfig): Promise<string> {
    const activity = await prisma.activity.upsert({
      where: { key: "rock_paper_scissors" },
      update: {
        configJson: config as unknown as Prisma.JsonObject,
      },
      create: {
        key: "rock_paper_scissors",
        name: "Rock Paper Scissors",
        configJson: config as unknown as Prisma.JsonObject,
      },
    });
    return activity.id;
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

  function scheduleInactivity(sessionId: string): void {
    inactivityHandles.get(sessionId)?.cancel();
    const handle = scheduler.schedule(sessionId, -2, INACTIVITY_MS);
    inactivityHandles.set(sessionId, handle);
  }

  function cancelInactivity(sessionId: string): void {
    inactivityHandles.get(sessionId)?.cancel();
    inactivityHandles.delete(sessionId);
  }

  function scheduleLobbyExpiry(sessionId: string): void {
    cancelLobbyExpiry(sessionId);
    const handle = setTimeout(() => {
      void expireLobbySession(sessionId);
    }, LOBBY_IDLE_MS);
    lobbyExpiryHandles.set(sessionId, handle);
  }

  function touchLobbyActivity(sessionId: string, state: SessionState): void {
    state.lastActivityMs = Date.now();
    if (state.phase === "lobby" || state.phase === "countdown") {
      scheduleLobbyExpiry(sessionId);
    } else {
      cancelLobbyExpiry(sessionId);
    }
  }

  function cancelLobbyExpiry(sessionId: string): void {
    const handle = lobbyExpiryHandles.get(sessionId);
    if (handle) {
      clearTimeout(handle);
      lobbyExpiryHandles.delete(sessionId);
    }
  }

  async function expireLobbySession(sessionId: string, reason = "lobby_timeout"): Promise<void> {
    cancelLobbyExpiry(sessionId);
    const state = await loadState(sessionId);
    if (!state || (state.phase !== "lobby" && state.phase !== "countdown")) {
      return;
    }
    try {
      await prisma.activitySession.update({
        where: { id: sessionId },
        data: { status: "ended", endedAt: new Date() },
      });
    } catch {
      // ignore missing rows
    }
    let scoreboard: ScoreboardView | undefined;
    try {
      scoreboard = await getScoreboard(sessionId);
    } catch {
      scoreboard = undefined;
    }
    await publisher.publish({
      name: "activity.session.ended",
      payload: {
        sessionId,
        finalScoreboard: scoreboard,
        winnerUserId: undefined,
        reason,
      },
    });
    await deleteState(sessionId);
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

  async function startCountdown(sessionId: string, state: SessionState): Promise<void> {
    const now = Date.now();
    state.phase = "countdown";
    state.countdown = {
      startedAt: now,
      durationMs: state.cfg.countdownMs,
      endsAt: now + state.cfg.countdownMs,
      reason: "lobby",
    };
    state.lastActivityMs = now;
    await saveState(sessionId, state);
    touchLobbyActivity(sessionId, state);
    scheduleTimer(sessionId, -1, state.cfg.countdownMs);
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

  async function cancelCountdown(sessionId: string, state: SessionState, reason: string): Promise<void> {
    if (state.phase !== "countdown") {
      return;
    }
    cancelTimer(sessionId);
    state.phase = "lobby";
    state.countdown = undefined;
    state.lastActivityMs = Date.now();
    await saveState(sessionId, state);
    touchLobbyActivity(sessionId, state);
    await publisher.publish({
      name: "activity.session.countdown.cancelled",
      payload: { sessionId, reason },
    });
    await emitPresence(sessionId, state);
  }

  async function maybeStartCountdown(sessionId: string, state: SessionState): Promise<void> {
    if (!state.lobbyReady || state.phase !== "lobby") {
      return;
    }
    if (!everyoneReady(state)) {
      return;
    }
    await startCountdown(sessionId, state);
  }

  async function listSessionsForUser(params: {
    userId: string;
    statuses?: Array<"pending" | "running" | "ended">;
  }): Promise<RockPaperScissorsLobbySummary[]> {
    const statuses = params.statuses && params.statuses.length > 0 ? params.statuses : undefined;
    const sessions = await prisma.activitySession.findMany({
      where: {
        activity: { key: "rock_paper_scissors" },
        participants: { some: { userId: params.userId } },
        status: statuses ? { in: statuses } : undefined,
      },
      orderBy: { id: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        metadataJson: true,
        startedAt: true,
        participants: { select: { userId: true, joinedAt: true }, orderBy: { joinedAt: "asc" } },
      },
    });

    const results: RockPaperScissorsLobbySummary[] = [];
    for (const session of sessions) {
      const state = await loadState(session.id);
      const presence: Record<string, LobbyPresence> = state?.presence ?? {};
      const creatorFromState = state?.creatorUserId;
      const metadata = session.metadataJson as { creatorUserId?: string } | null;
      const creatorUserId = creatorFromState ?? metadata?.creatorUserId ?? session.participants[0]?.userId ?? "";
      const createdMs =
        session.startedAt?.getTime() ??
        session.participants[0]?.joinedAt?.getTime() ??
        Date.now();
      const lastActivity = state?.lastActivityMs ?? createdMs;
      const now = Date.now();
      const phase = state?.phase ?? (session.status === "pending" ? "lobby" : session.status === "running" ? "running" : "ended");
      if ((phase === "lobby" || phase === "countdown") && now - lastActivity > LOBBY_IDLE_MS) {
        await expireLobbySession(session.id);
        continue;
      }
      const expiresAt = phase === "lobby" || phase === "countdown" ? lastActivity + LOBBY_IDLE_MS : undefined;
      results.push({
        id: session.id,
        activityKey: "rock_paper_scissors",
        status: session.status as RockPaperScissorsLobbySummary["status"],
        phase: state?.phase ?? (session.status === "pending" ? "lobby" : session.status === "running" ? "running" : "ended"),
        lobbyReady: state?.lobbyReady ?? false,
        creatorUserId,
        expiresAt,
        participants: session.participants.map((participant) => ({
          userId: participant.userId,
          joined: presence[participant.userId]?.joined ?? false,
          ready: presence[participant.userId]?.ready ?? false,
        })),
        countdown: state?.countdown,
      });
    }
    return results;
  }

  async function createSession(params: CreateRpsSessionParams): Promise<string> {
    if (params.activityKey !== "rock_paper_scissors") {
      throw new Error("unsupported_activity");
    }
    const participants = Array.from(new Set(params.participants));
    if (participants.length !== 2) {
      throw new Error("invalid_participants");
    }
    const cfg = mergeConfig(params.config);
    const activityId = await ensureActivity(cfg);

    const session = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.activitySession.create({
        data: {
          activityId,
          status: "pending",
          metadataJson: { creatorUserId: params.creatorUserId },
        },
      });
      await Promise.all(
        participants.map((userId) =>
          tx.participant.create({
            data: {
              sessionId: created.id,
              userId,
            },
          }),
        ),
      );
      for (let index = 0; index < cfg.rounds; index += 1) {
        await tx.round.create({
          data: {
            sessionId: created.id,
            index,
            state: "queued",
            payloadJson: { timeLimitMs: cfg.roundTimeMs },
          },
        });
      }
      return created;
    });

    const state: SessionState = {
      phase: "lobby",
      currentRound: -1,
      totalRounds: cfg.rounds,
      cfg,
      participants,
      creatorUserId: params.creatorUserId,
      presence: Object.fromEntries(
        participants.map((userId) => [userId, { joined: false, ready: false, lastSeen: 0 }]),
      ),
      lobbyReady: false,
      moves: {},
      score: Object.fromEntries(participants.map((userId) => [userId, 0])),
      lastActivityMs: Date.now(),
    };
    await saveState(session.id, state);
    touchLobbyActivity(session.id, state);
    await publisher.publish({
      name: "activity.session.created",
      payload: { sessionId: session.id },
    });

    return session.id;
  }

  async function startSession(params: StartRpsSessionParams): Promise<void> {
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
    if (!state) {
      throw new Error("session_state_missing");
    }
    if (state.phase !== "lobby" && state.phase !== "countdown") {
      throw new Error("session_not_in_lobby");
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

  async function beginRound(sessionId: string, roundIndex: number): Promise<void> {
    const state = await loadState(sessionId);
    if (!state) {
      throw new Error("session_state_missing");
    }
    state.phase = "running";
    state.countdown = undefined;
    state.currentRound = roundIndex;
    if (!state.moves[roundIndex]) {
      state.moves[roundIndex] = {};
    }
    state.lastActivityMs = Date.now();
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (roundIndex === 0) {
        await tx.activitySession.update({
          where: { id: sessionId },
          data: { status: "running", startedAt: new Date() },
        });
      }
      await tx.round.update({
        where: { sessionId_index: { sessionId, index: roundIndex } },
        data: { state: "running", startedAt: new Date() },
      });
    });
    await saveState(sessionId, state);
    cancelLobbyExpiry(sessionId);
    scheduleTimer(sessionId, roundIndex, state.cfg.roundTimeMs);
    scheduleInactivity(sessionId);
    if (roundIndex === 0) {
      await publisher.publish({
        name: "activity.session.started",
        payload: { sessionId, currentRound: 0 },
      });
    }
    await publisher.publish({
      name: "activity.round.started",
      payload: {
        sessionId,
        index: roundIndex,
        payload: { timeLimitMs: state.cfg.roundTimeMs, activity: "rock_paper_scissors" },
      },
    });
  }

  function beats(a: Move, b: Move): boolean {
    return (
      (a === "rock" && b === "scissors") ||
      (a === "scissors" && b === "paper") ||
      (a === "paper" && b === "rock")
    );
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

  async function resolveRound(sessionId: string, roundIndex: number, existingState?: SessionState): Promise<void> {
    const state = existingState ?? (await loadState(sessionId));
    if (!state) {
      return;
    }
    const moves = state.moves[roundIndex] ?? {};
    const [userA, userB] = state.participants;
    const moveA = moves[userA] ?? null;
    const moveB = moves[userB] ?? null;
    cancelTimer(sessionId);

    let winnerUserId: string | null = null;
    let reason: string | undefined;
    if (moveA && moveB) {
      if (moveA === moveB) {
        reason = "draw";
      } else {
        winnerUserId = beats(moveA, moveB) ? userA : userB;
        reason = "decided";
      }
    } else if (moveA || moveB) {
      winnerUserId = moveA ? userA : userB;
      reason = "opponent_missing_move";
    } else {
      reason = "no_moves";
    }

    await prisma.round.update({
      where: { sessionId_index: { sessionId, index: roundIndex } },
      data: { state: "done", endedAt: new Date() },
    });

    if (winnerUserId) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.scoreEvent.create({
          data: {
            sessionId,
            userId: winnerUserId!,
            delta: 1,
            reason: "round_win",
          },
        });
        await tx.participant.update({
          where: { sessionId_userId: { sessionId, userId: winnerUserId! } },
          data: { score: { increment: 1 } },
        });
      });
      state.score[winnerUserId] = (state.score[winnerUserId] ?? 0) + 1;
      await publisher.publish({
        name: "activity.score.updated",
        payload: {
          sessionId,
          userId: winnerUserId,
          delta: 1,
          total: state.score[winnerUserId],
        },
      });
    }
    state.lastActivityMs = Date.now();
    await saveState(sessionId, state);

    const scoreboard = await getScoreboard(sessionId);
    await publisher.publish({
      name: "activity.round.ended",
      payload: {
        sessionId,
        index: roundIndex,
        scoreboard,
        winnerUserId: winnerUserId ?? undefined,
        moves: [
          { userId: userA, move: moveA },
          { userId: userB, move: moveB },
        ],
        reason,
      },
    });

    const winThreshold = Math.floor(state.cfg.rounds / 2) + 1;
    const hasWinnerByScore = winnerUserId && state.score[winnerUserId] >= winThreshold;
    const roundsRemaining = roundIndex + 1 < state.totalRounds;
    const finalWinner =
      hasWinnerByScore
        ? winnerUserId
        : !roundsRemaining
        ? scoreboard.participants[0]?.score === scoreboard.participants[1]?.score
          ? undefined
          : scoreboard.participants[0]?.userId
        : undefined;

    if (hasWinnerByScore || !roundsRemaining) {
      await prisma.activitySession.update({
        where: { id: sessionId },
        data: { status: "ended", endedAt: new Date() },
      });
      await publisher.publish({
        name: "activity.session.ended",
        payload: {
          sessionId,
          finalScoreboard: scoreboard,
          winnerUserId: finalWinner,
          reason: hasWinnerByScore ? "win_threshold" : reason ?? "completed",
        },
      });
      cancelInactivity(sessionId);
      cancelLobbyExpiry(sessionId);
      await deleteState(sessionId);
      return;
    }

    const nextRound = roundIndex + 1;
    state.currentRound = nextRound;
    state.moves[nextRound] = {};
    await prisma.round.update({
      where: { sessionId_index: { sessionId, index: nextRound } },
      data: { state: "running", startedAt: new Date() },
    });
    await saveState(sessionId, state);
    await publisher.publish({
      name: "activity.round.started",
      payload: { sessionId, index: nextRound, payload: { timeLimitMs: state.cfg.roundTimeMs, activity: "rock_paper_scissors" } },
    });
    scheduleTimer(sessionId, nextRound, state.cfg.roundTimeMs);
    scheduleInactivity(sessionId);
  }

  async function submitMove(params: SubmitRpsMoveParams): Promise<void> {
    try {
      await limiter.check(`rps:submit:${params.sessionId}:${params.userId}`, 5, 2_000);
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        throw error;
      }
      throw new Error("rate_limit_error");
    }
    const state = await loadState(params.sessionId);
    if (!state) {
      throw new Error("session_state_missing");
    }
    if (state.phase !== "running") {
      throw new Error("session_not_running");
    }
    const roundIndex = state.currentRound;
    if (roundIndex < 0) {
      throw new Error("round_not_started");
    }
    if (!state.participants.includes(params.userId)) {
      throw new Error("participant_not_in_session");
    }
    if (!state.moves[roundIndex]) {
      state.moves[roundIndex] = {};
    }
    if (state.moves[roundIndex][params.userId]) {
      return;
    }
    state.moves[roundIndex][params.userId] = params.move;
    state.lastActivityMs = Date.now();
    await saveState(params.sessionId, state);
    scheduleInactivity(params.sessionId);
    const moves = state.moves[roundIndex];
    const allSubmitted = state.participants.every((userId) => Boolean(moves[userId]));
    if (allSubmitted) {
      await resolveRound(params.sessionId, roundIndex, state);
    }
  }

  async function joinSession(params: { sessionId: string; userId: string }): Promise<void> {
    const state = await loadState(params.sessionId);
    if (!state) {
      throw new Error("session_state_missing");
    }
    if (!state.participants.includes(params.userId)) {
      throw new Error("participant_not_in_session");
    }
    const presence = ensurePresence(state, params.userId);
    const now = Date.now();
    presence.joined = true;
    presence.lastSeen = now;
    state.lastActivityMs = now;
    await saveState(params.sessionId, state);
    touchLobbyActivity(params.sessionId, state);
    if (state.phase === "countdown" && !everyoneReady(state)) {
      await cancelCountdown(params.sessionId, state, "participant_rejoined");
    } else {
      await emitPresence(params.sessionId, state);
    }
  }

  async function leaveSession(params: { sessionId: string; userId: string }): Promise<void> {
    const state = await loadState(params.sessionId);
    if (!state) {
      return;
    }
    const presence = ensurePresence(state, params.userId);
    presence.joined = false;
    presence.ready = false;
    presence.lastSeen = Date.now();
    state.lastActivityMs = Date.now();
    await saveState(params.sessionId, state);
    touchLobbyActivity(params.sessionId, state);
    const remaining = state.participants.find((userId) => userId !== params.userId);
    if (state.phase === "running" && remaining) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.scoreEvent.create({
          data: { sessionId: params.sessionId, userId: remaining, delta: 1, reason: "forfeit" },
        });
        await tx.participant.update({
          where: { sessionId_userId: { sessionId: params.sessionId, userId: remaining } },
          data: { score: { increment: 1 } },
        });
        await tx.activitySession.update({
          where: { id: params.sessionId },
          data: { status: "ended", endedAt: new Date() },
        });
      });
      state.score[remaining] = (state.score[remaining] ?? 0) + 1;
      const scoreboard = await getScoreboard(params.sessionId);
      await publisher.publish({
        name: "activity.session.ended",
        payload: {
          sessionId: params.sessionId,
          finalScoreboard: scoreboard,
          winnerUserId: remaining,
          reason: "opponent_left",
        },
      });
      cancelTimer(params.sessionId);
      cancelInactivity(params.sessionId);
      cancelLobbyExpiry(params.sessionId);
      await deleteState(params.sessionId);
      return;
    }
    if (state.phase === "countdown") {
      await cancelCountdown(params.sessionId, state, "participant_left");
    }
    await emitPresence(params.sessionId, state);
  }

  async function setReady(params: { sessionId: string; userId: string; ready: boolean }): Promise<void> {
    const state = await loadState(params.sessionId);
    if (!state) {
      throw new Error("session_state_missing");
    }
    if (!state.participants.includes(params.userId)) {
      throw new Error("participant_not_in_session");
    }
    const presence = ensurePresence(state, params.userId);
    if (!presence.joined) {
      presence.joined = true;
    }
    presence.ready = params.ready;
    presence.lastSeen = Date.now();
    state.lobbyReady = everyoneReady(state);
    state.lastActivityMs = Date.now();
    await saveState(params.sessionId, state);
    touchLobbyActivity(params.sessionId, state);
    if (!params.ready && state.phase === "countdown") {
      await cancelCountdown(params.sessionId, state, "participant_unready");
      return;
    }
    await maybeStartCountdown(params.sessionId, state);
    if (state.phase === "lobby") {
      await emitPresence(params.sessionId, state);
    }
  }

  async function handleTimerElapsed(sessionId: string, roundIndex: number): Promise<void> {
    if (roundIndex === -2) {
      const state = await loadState(sessionId);
      if (!state || state.phase !== "running") {
        return;
      }
      const scoreboard = await getScoreboard(sessionId);
      await prisma.activitySession.update({
        where: { id: sessionId },
        data: { status: "ended", endedAt: new Date() },
      });
      await publisher.publish({
        name: "activity.session.ended",
        payload: {
          sessionId,
          finalScoreboard: scoreboard,
          winnerUserId: scoreboard.participants[0]?.userId,
          reason: "inactivity",
        },
      });
      cancelTimer(sessionId);
      cancelInactivity(sessionId);
      await deleteState(sessionId);
      return;
    }
    if (roundIndex === -1) {
      await beginRound(sessionId, 0);
      return;
    }
    await resolveRound(sessionId, roundIndex);
  }

  async function getSessionView(sessionId: string): Promise<unknown> {
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
    if (session.activity.key !== "rock_paper_scissors") {
      throw new Error("session_not_found");
    }
    const state = await loadState(sessionId);
    const currentRoundIndex = state && state.currentRound >= 0 ? state.currentRound : undefined;
    return {
      id: sessionId,
      status: session.status as "pending" | "running" | "ended",
      activityKey: "rock_paper_scissors" as const,
      participants: session.participants.map((participant) => ({
        userId: participant.userId,
        score: participant.score,
      })),
      currentRoundIndex,
      rounds: session.rounds.map((round) => ({ index: round.index, state: round.state as "queued" | "running" | "done" })),
      lobbyPhase: state?.phase === "lobby",
      lobbyReady: state?.lobbyReady ?? false,
      presence: state
        ? state.participants.map((userId) => ({
            userId,
            joined: state.presence[userId]?.joined ?? false,
            ready: state.presence[userId]?.ready ?? false,
          }))
        : undefined,
      countdown: state?.countdown,
    };
  }

  return {
    createSession,
    listSessionsForUser,
    startSession,
    submitMove,
    getSessionView,
    handleTimerElapsed,
    joinSession,
    leaveSession,
    setReady,
  };
}
