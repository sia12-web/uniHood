import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { RedisClientType } from "redis";
import { SlidingWindowLimiter, RateLimitExceededError } from "../lib/rateLimiter";
import { EventPublisher } from "../lib/events";
import { TimerScheduler, TimerHandle } from "../lib/timers";
import { createQuickTriviaSessionDto, submitQuickTriviaRoundDto, QuickTriviaRoundView } from "../dto/sessionDtos";

interface QuickTriviaConfig {
  rounds: number;
  timeLimitMs: number;
  difficulties: ("E" | "M" | "H")[];
}

interface AnswerRecord { choiceIndex: number; correct: boolean; responseTimeMs: number; }
interface RoundStateBucket { [userId: string]: AnswerRecord; }

interface SessionStateQT {
  phase: "lobby" | "running";
  currentRound: number;
  cfg: QuickTriviaConfig;
  answers: Record<number, RoundStateBucket>;
  participants: string[];
  creatorUserId: string;
  roundStartMs: Record<number, number>; // server start times
}

const SESSION_STATE_KEY = (sessionId: string) => `qt:sess:${sessionId}:state`;

export interface CreateQuickTriviaSessionParams {
  activityKey: "quick_trivia";
  creatorUserId: string;
  participants: [string, string];
  config?: Partial<{ rounds: number; timeLimitMs: number; difficulties: ("E" | "M" | "H")[] }>;
}

export interface StartQuickTriviaSessionParams { sessionId: string; byUserId: string; isAdmin: boolean; }
export interface SubmitQuickTriviaParams { sessionId: string; userId: string; choiceIndex: number; clientMs?: number; }

export interface QuickTriviaService {
  createSession(params: CreateQuickTriviaSessionParams): Promise<string>;
  startSession(params: StartQuickTriviaSessionParams): Promise<void>;
  submitRound(params: SubmitQuickTriviaParams): Promise<void>;
  getSessionView(sessionId: string): Promise<unknown>; // implement later
  handleTimerElapsed(sessionId: string, roundIndex: number): Promise<void>;
  joinSession(params: { sessionId: string; userId: string }): Promise<void>;
  leaveSession(params: { sessionId: string; userId: string }): Promise<void>;
  setReady(params: { sessionId: string; userId: string; ready: boolean }): Promise<void>;
}

interface Dependencies {
  prisma: PrismaClient;
  redis: RedisClientType;
  limiter: SlidingWindowLimiter;
  publisher: EventPublisher;
  scheduler: TimerScheduler;
}

function defaultConfig(): QuickTriviaConfig {
  return { rounds: 5, timeLimitMs: 18_000, difficulties: ["E", "M", "H"] };
}

function mergeConfig(input?: Partial<QuickTriviaConfig>): QuickTriviaConfig {
  const base = defaultConfig();
  return {
    rounds: input?.rounds && input.rounds > 0 ? input.rounds : base.rounds,
    timeLimitMs: input?.timeLimitMs && input.timeLimitMs >= 12_000 && input.timeLimitMs <= 25_000 ? input.timeLimitMs : base.timeLimitMs,
    difficulties: input?.difficulties && input.difficulties.length > 0 ? input.difficulties : base.difficulties,
  };
}

export function createQuickTriviaService(deps: Dependencies): QuickTriviaService {
  const { prisma, redis, limiter, publisher, scheduler } = deps;
  const timerHandles = new Map<string, TimerHandle>();

  async function ensureActivity(): Promise<string> {
    const cfg = defaultConfig();
    const activity = await prisma.activity.upsert({
      where: { key: "quick_trivia" },
      update: {},
      create: {
        key: "quick_trivia",
        name: "Quick Trivia",
        // Persist as plain JSON object
        configJson: { rounds: cfg.rounds, timeLimitMs: cfg.timeLimitMs, difficulties: cfg.difficulties },
      },
    });
    return activity.id;
  }

  async function loadState(sessionId: string): Promise<SessionStateQT | null> {
    const raw = await redis.get(SESSION_STATE_KEY(sessionId));
    return raw ? (JSON.parse(raw) as SessionStateQT) : null;
  }

  async function saveState(sessionId: string, state: SessionStateQT): Promise<void> {
    await redis.set(SESSION_STATE_KEY(sessionId), JSON.stringify(state));
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

  function assertState(state: SessionStateQT | null, sessionId: string): asserts state is SessionStateQT {
    if (!state) throw new Error(`session_state_missing:${sessionId}`);
  }

  async function pickQuestions(cfg: QuickTriviaConfig): Promise<Array<{ id: string; question: string; options: string[]; correctIndex: number }>> {
    // naive selection: random shuffle filtered by difficulties, take cfg.rounds
    const rows = await prisma.triviaQuestion.findMany({ where: { difficulty: { in: cfg.difficulties as string[] } } });
    const shuffled = rows.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, cfg.rounds).map((q) => ({
      id: q.id,
      question: q.question,
      options: q.optionsJson as string[],
      correctIndex: q.correctIndex,
    }));
  }

  async function createSession(params: CreateQuickTriviaSessionParams): Promise<string> {
    const parse = createQuickTriviaSessionDto.safeParse(params);
    if (!parse.success) throw new Error("invalid_quick_trivia_session");
    const unique = new Set(params.participants);
    if (unique.size !== 2) throw new Error("invalid_participants");
    const activityId = await ensureActivity();
    const cfg = mergeConfig(params.config);

    const session = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.activitySession.create({
        data: { activityId, status: "pending", metadataJson: { creatorUserId: params.creatorUserId } },
      });
      await Promise.all(params.participants.map((userId) => tx.participant.create({ data: { sessionId: created.id, userId } })));
      return created;
    });

    const state: SessionStateQT = { phase: "lobby", currentRound: -1, cfg, answers: {}, participants: params.participants, creatorUserId: params.creatorUserId, roundStartMs: {} };
    await saveState(session.id, state);
    await publisher.publish({ name: "activity.session.created", payload: { sessionId: session.id } });
    return session.id;
  }

  async function startSession(params: StartQuickTriviaSessionParams): Promise<void> {
    const session = await prisma.activitySession.findUnique({ where: { id: params.sessionId }, select: { id: true, status: true, metadataJson: true } });
    if (!session) throw new Error("session_not_found");

    const state = await loadState(params.sessionId); assertState(state, params.sessionId);
    const creatorFromState = state.creatorUserId;
    const creatorFromDb = (session.metadataJson as { creatorUserId?: string } | null)?.creatorUserId;
    const creatorUserId = creatorFromState ?? creatorFromDb;
    if (!params.isAdmin && creatorUserId && params.byUserId !== creatorUserId) throw new Error("forbidden");

    if (state.phase !== "lobby") throw new Error("session_not_in_lobby");

    const questions = await pickQuestions(state.cfg);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (let i = 0; i < questions.length; i += 1) {
        await tx.round.create({
          data: { sessionId: params.sessionId, index: i, state: "queued", payloadJson: { qId: questions[i].id, question: questions[i].question, options: questions[i].options, timeLimitMs: state.cfg.timeLimitMs } },
        });
      }
      await tx.activitySession.update({ where: { id: params.sessionId }, data: { status: "running", startedAt: new Date() } });
    });

    await prisma.round.update({ where: { sessionId_index: { sessionId: params.sessionId, index: 0 } }, data: { state: "running", startedAt: new Date() } });

    state.phase = "running"; state.currentRound = 0; state.answers = {}; state.roundStartMs[0] = Date.now();
    await saveState(params.sessionId, state);
    scheduleTimer(params.sessionId, 0, state.cfg.timeLimitMs);

    await publisher.publish({ name: "activity.session.started", payload: { sessionId: params.sessionId, currentRound: 0 } });
    await publisher.publish({ name: "activity.round.started", payload: { sessionId: params.sessionId, index: 0, payload: await getRoundPayload(params.sessionId, 0) } });
  }

  async function getRoundPayload(sessionId: string, roundIndex: number): Promise<QuickTriviaRoundView["payload"] | null> {
    const round = await prisma.round.findUnique({ where: { sessionId_index: { sessionId, index: roundIndex } }, select: { payloadJson: true } });
    return (round?.payloadJson as QuickTriviaRoundView["payload"] | null) ?? null;
  }

  async function submitRound(params: SubmitQuickTriviaParams): Promise<void> {
    try { await limiter.check(`qt_submit:${params.sessionId}:${params.userId}`, 1, 5_000); } catch (e) { if (e instanceof RateLimitExceededError) throw e; throw new Error("rate_limit_error"); }
    const state = await loadState(params.sessionId); assertState(state, params.sessionId);
    if (state.phase !== "running") throw new Error("session_not_running");
    const roundIndex = state.currentRound; if (roundIndex < 0) throw new Error("round_not_started");

    const round = await prisma.round.findUnique({ where: { sessionId_index: { sessionId: params.sessionId, index: roundIndex } } }); if (!round) throw new Error("round_not_found");
    if (round.state === "done") return;

    if (!state.answers[roundIndex]) state.answers[roundIndex] = {};
    if (state.answers[roundIndex][params.userId]) return; // already answered

    const question = round.payloadJson as { qId: string; question: string; options: string[]; timeLimitMs: number };
    const trivia = await prisma.triviaQuestion.findUnique({ where: { id: question.qId } });
    if (!trivia) throw new Error("question_not_found");
    const correct = params.choiceIndex === trivia.correctIndex;

    const startMs = state.roundStartMs[roundIndex] ?? Date.now();
    const responseTimeMs = Math.min(Date.now() - startMs, state.cfg.timeLimitMs);
    const delta = correct ? 1 : 0;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.scoreEvent.create({ data: { sessionId: params.sessionId, userId: params.userId, delta, reason: "round" } });
      await tx.participant.update({ where: { sessionId_userId: { sessionId: params.sessionId, userId: params.userId } }, data: { score: { increment: delta } } });
    });

    state.answers[roundIndex][params.userId] = { choiceIndex: params.choiceIndex, correct, responseTimeMs };
    await saveState(params.sessionId, state);

    const participant = await prisma.participant.findUnique({ where: { sessionId_userId: { sessionId: params.sessionId, userId: params.userId } }, select: { score: true } });
    await publisher.publish({ name: "activity.score.updated", payload: { sessionId: params.sessionId, userId: params.userId, delta, total: participant?.score ?? 0 } });

    const bothAnswered = state.participants.every((uid) => state.answers[roundIndex][uid]);
    if (bothAnswered) await endRound(params.sessionId, roundIndex, state);
  }

  async function endRound(sessionId: string, roundIndex: number, state?: SessionStateQT | null): Promise<void> {
    const current = state ?? (await loadState(sessionId)); assertState(current, sessionId);
    cancelTimer(sessionId);

    await prisma.round.update({ where: { sessionId_index: { sessionId, index: roundIndex } }, data: { state: "done", endedAt: new Date() } });

    const scoreboard = await getScoreboard(sessionId);
    const questionPayload = await getRoundPayload(sessionId, roundIndex);
    const trivia = questionPayload ? await prisma.triviaQuestion.findUnique({ where: { id: questionPayload.qId } }) : null;
    const correctIndex = trivia?.correctIndex;

    await publisher.publish({ name: "activity.round.ended", payload: { sessionId, index: roundIndex, scoreboard, correctIndex } });

    const nextRound = roundIndex + 1;
    if (nextRound < current.cfg.rounds) {
      current.currentRound = nextRound;
      current.roundStartMs[nextRound] = Date.now();
      await prisma.round.update({ where: { sessionId_index: { sessionId, index: nextRound } }, data: { state: "running", startedAt: new Date() } });
      await saveState(sessionId, current);
      await publisher.publish({ name: "activity.round.started", payload: { sessionId, index: nextRound, payload: await getRoundPayload(sessionId, nextRound) } });
      scheduleTimer(sessionId, nextRound, current.cfg.timeLimitMs);
    } else {
      await prisma.activitySession.update({ where: { id: sessionId }, data: { status: "ended", endedAt: new Date() } });
      const tieBreak = await computeTieBreak(sessionId, current);
      await publisher.publish({ name: "activity.session.ended", payload: { sessionId, finalScoreboard: scoreboard, tieBreak } });
      await redis.del(SESSION_STATE_KEY(sessionId));
    }
  }

  async function computeTieBreak(sessionId: string, state: SessionStateQT): Promise<{ winnerUserId?: string } | undefined> {
    const scoreboard = await getScoreboard(sessionId);
    if (!scoreboard || scoreboard.participants.length < 2) return undefined;
    const [p1, p2] = scoreboard.participants;
    if (p1.score === p2.score) {
      const medianTimes: Record<string, number> = {};
      for (const userId of state.participants) {
        const times: number[] = [];
        for (const roundAnswers of Object.values(state.answers)) {
          const ans = roundAnswers[userId];
          if (ans) times.push(ans.responseTimeMs);
        }
        times.sort((a, b) => a - b);
        if (times.length > 0) {
          const mid = Math.floor(times.length / 2);
          medianTimes[userId] = times.length % 2 === 1 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2);
        }
      }
      const entries = Object.entries(medianTimes);
      if (entries.length === 2) {
        const winner = entries.sort((a, b) => a[1] - b[1])[0][0];
        return { winnerUserId: winner };
      }
    }
    return undefined;
  }

  async function getScoreboard(sessionId: string): Promise<{ participants: { userId: string; score: number }[]; lastDelta?: { userId: string; delta: number } }> {
    const participants = await prisma.participant.findMany({ where: { sessionId }, select: { userId: true, score: true }, orderBy: { score: "desc" } });
    const lastDelta = await prisma.scoreEvent.findFirst({ where: { sessionId }, orderBy: { at: "desc" }, select: { userId: true, delta: true } });
    return { participants, lastDelta: lastDelta ?? undefined };
  }

  async function getSessionView(sessionId: string): Promise<unknown> {
    const session = await prisma.activitySession.findUnique({ where: { id: sessionId }, include: { activity: { select: { key: true } }, participants: { select: { userId: true, score: true }, orderBy: { joinedAt: "asc" } }, rounds: { select: { index: true, state: true }, orderBy: { index: "asc" } } } });
    if (!session) throw new Error("session_not_found");
    const state = await loadState(sessionId);
    return {
      id: sessionId,
      status: session.status,
      activityKey: "quick_trivia",
      participants: session.participants.map((p) => ({ userId: p.userId, score: p.score })),
      currentRoundIndex: state?.phase === "running" ? state.currentRound : undefined,
      rounds: session.rounds.map((r) => ({ index: r.index, state: r.state })),
      lobbyPhase: state?.phase === "lobby",
    };
  }

  async function handleTimerElapsed(sessionId: string, roundIndex: number): Promise<void> {
    const state = await loadState(sessionId); if (!state) return;
    if (state.phase !== "running" || state.currentRound !== roundIndex) return;
    await endRound(sessionId, roundIndex, state);
  }

  async function joinSession(): Promise<void> {
    // Quick Trivia currently does not track lobby presence.
  }

  async function leaveSession(): Promise<void> {
    // Quick Trivia currently does not track lobby presence.
  }

  async function setReady(): Promise<void> {
    // Quick Trivia ignores ready toggles for now.
  }

  return {
    createSession,
    startSession,
    submitRound,
    getSessionView,
    handleTimerElapsed,
    joinSession,
    leaveSession,
    setReady,
  };
}
