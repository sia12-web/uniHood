import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { RedisClientType } from "redis";
import { EventPublisher } from "../lib/events";
import { TimerScheduler, TimerHandle } from "../lib/timers";
import {
  CreateStorySessionDto,
  StorySessionView,
  StoryParticipantView,
} from "../dto/sessionDtos";

type StorySessionCreateParams = CreateStorySessionDto & { sessionId?: string };

type StoryPhase =
  | "lobby"
  | "ready_check"
  | "role_selection"
  | "countdown"
  | "running"
  | "completed";

interface CountdownState {
  startedAt: number;
  durationMs: number;
  endsAt: number;
}

interface StoryState {
  phase: StoryPhase;
  roles: { boy?: string; girl?: string };
  scenario: string | null;
  lines: Array<{ userId: string; content: string; roundIdx: number; score?: number }>;
  currentRound: number;
  turnDeadline: number | null;
  participants: string[];
  creatorUserId: string;
  winner?: "boy" | "girl" | "tie";
  config: {
    turns: number;
    turnSeconds: number;
    countdownMs: number;
  };
  readyMap: Record<string, boolean>;
  joinedMap: Record<string, boolean>;
  countdown: CountdownState | null;
  lastActivityMs?: number;
}

export type StoryLobbySummary = {
  id: string;
  activityKey: "story_builder";
  status: "pending" | "running" | "ended";
  phase: StoryPhase;
  lobbyReady: boolean;
  creatorUserId: string;
  participants: StoryParticipantView[];
  countdown?: CountdownState | null;
};

const SESSION_KEY = (sessionId: string) => `story:${sessionId}:state`;
const STORY_ACTIVITY_KEY = "story_builder";
const COUNTDOWN_TIMER_INDEX = -101;
const DEFAULT_COUNTDOWN_MS = 10_000;

const SCENARIOS = [
  "You wake up in a library where every book describes a future that has not yet happened.",
  "Two friends find a map that changes itself whenever they make a decision.",
  "A mysterious letter invites the pair to solve a puzzle before midnight.",
  "They meet at a coffee shop, but one of them is living 5 minutes in the future.",
  "An old radio starts broadcasting a conversation they had yesterday.",
];

export class StoryBuilderService {
  private readonly countdownHandles = new Map<string, TimerHandle>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: RedisClientType,
    private readonly publisher: EventPublisher,
    private readonly scheduler: TimerScheduler,
  ) {}

  async createSession(params: StorySessionCreateParams): Promise<string> {
    if (params.activityKey !== STORY_ACTIVITY_KEY) {
      throw new Error("unsupported_activity");
    }
    const participants = Array.from(new Set(params.participants ?? [])).filter(Boolean);
    if (participants.length !== 2) {
      throw new Error("invalid_participants");
    }
    if (!participants.includes(params.creatorUserId)) {
      throw new Error("creator_must_participate");
    }

    const activityId = await this.ensureActivity();
    const config = {
      turns: params.config?.turns ?? 6,
      turnSeconds: params.config?.turnSeconds ?? 60,
      countdownMs: params.config?.countdownMs ?? DEFAULT_COUNTDOWN_MS,
    };

    const session = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.activitySession.create({
        data: {
          activityId,
          status: "pending",
          metadataJson: {
            activityKey: STORY_ACTIVITY_KEY,
            creatorUserId: params.creatorUserId,
            config,
          },
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

      return created;
    });

    const readyMap = Object.fromEntries(participants.map((userId) => [userId, false]));
    const joinedMap = Object.fromEntries(participants.map((userId) => [userId, userId === params.creatorUserId]));

    const state: StoryState = {
      phase: "lobby",
      roles: {},
      scenario: null,
      lines: [],
      currentRound: 0,
      turnDeadline: null,
      participants,
      creatorUserId: params.creatorUserId,
      config,
      readyMap,
      joinedMap,
      countdown: null,
      lastActivityMs: Date.now(),
    };

    await this.saveState(session.id, state);
    await this.publisher.publish({ name: "activity.session.created", payload: { sessionId: session.id } });
    return session.id;
  }

  async joinSession(params: { sessionId: string; userId: string }): Promise<void> {
    const state = await this.requireState(params.sessionId);
    this.ensureParticipant(state, params.userId);
    state.joinedMap[params.userId] = true;
    state.lastActivityMs = Date.now();
    await this.saveState(params.sessionId, state);
    await this.publishUpdate(params.sessionId, state);
  }

  async leaveSession(params: { sessionId: string; userId: string }): Promise<void> {
    const state = await this.requireState(params.sessionId);
    if (!state.participants.includes(params.userId)) {
      return;
    }
    state.joinedMap[params.userId] = false;
    state.readyMap[params.userId] = false;
    if (state.phase === "countdown") {
      await this.cancelCountdown(params.sessionId, state, "participant_left");
    } else if (state.phase === "ready_check" && !this.everyoneReady(state)) {
      state.phase = "lobby";
    }
    state.lastActivityMs = Date.now();
    await this.saveState(params.sessionId, state);
    await this.publishUpdate(params.sessionId, state);
  }

  async setReady(params: { sessionId: string; userId: string; ready: boolean }): Promise<void> {
    const state = await this.requireState(params.sessionId);
    this.ensureParticipant(state, params.userId);
    if (state.phase === "running" || state.phase === "completed") {
      return;
    }

    state.joinedMap[params.userId] = true;
    state.readyMap[params.userId] = params.ready;
    state.lastActivityMs = Date.now();

    if (!params.ready && state.phase === "countdown") {
      await this.cancelCountdown(params.sessionId, state, "participant_unready");
    }

    const everyoneReady = this.everyoneReady(state);
    state.phase = everyoneReady ? "role_selection" : params.ready ? "ready_check" : "lobby";

    await this.saveState(params.sessionId, state);
    await this.publishUpdate(params.sessionId, state);
  }

  async startSession(params: { sessionId: string; byUserId: string; isAdmin: boolean }): Promise<void> {
    const state = await this.requireState(params.sessionId);
    if (!params.isAdmin) {
      this.ensureParticipant(state, params.byUserId);
    }
    if (state.phase === "running" || state.phase === "completed") {
      return;
    }
    if (!this.rolesFilled(state)) {
      throw new Error("roles_not_filled");
    }
    await this.beginCountdown(params.sessionId, state);
  }

  async getSessionView(sessionId: string): Promise<StorySessionView | null> {
    const state = await this.loadOrRebuildState(sessionId);
    if (!state) {
      return null;
    }
    return this.mapToView(sessionId, state);
  }

  async listSessionsForUser(params: {
    userId: string;
    statuses?: Array<"pending" | "running" | "ended">;
  }): Promise<StoryLobbySummary[]> {
    const statuses = params.statuses && params.statuses.length > 0 ? params.statuses : undefined;
    const sessions = await this.prisma.activitySession.findMany({
      where: {
        activity: { key: STORY_ACTIVITY_KEY },
        participants: { some: { userId: params.userId } },
        status: statuses ? { in: statuses } : undefined,
      },
      orderBy: { id: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
      },
    });

    const summaries: StoryLobbySummary[] = [];
    for (const session of sessions) {
      const state = await this.loadOrRebuildState(session.id);
      if (!state) {
        continue;
      }
      summaries.push({
        id: session.id,
        activityKey: STORY_ACTIVITY_KEY,
        status: this.mapStatus(session.status as "pending" | "running" | "ended", state.phase),
        phase: state.phase,
        lobbyReady: this.everyoneReady(state),
        creatorUserId: state.creatorUserId,
        participants: this.buildParticipantView(state),
        countdown: state.countdown,
      });
    }
    return summaries;
  }

  async assignRole(sessionId: string, userId: string, role: "boy" | "girl"): Promise<StorySessionView> {
    const state = await this.requireState(sessionId);
    this.ensureParticipant(state, userId);
    if (state.phase === "lobby" || state.phase === "ready_check") {
      throw new Error("not_ready_for_roles");
    }

    if (role === "boy" && state.roles.boy && state.roles.boy !== userId) {
      throw new Error("role_taken");
    }
    if (role === "girl" && state.roles.girl && state.roles.girl !== userId) {
      throw new Error("role_taken");
    }

    if (role === "boy") {
      state.roles.boy = userId;
    } else {
      state.roles.girl = userId;
    }
    state.lastActivityMs = Date.now();

    if (this.rolesFilled(state)) {
      await this.beginCountdown(sessionId, state);
    } else {
      await this.saveState(sessionId, state);
    }
    return this.publishUpdate(sessionId, state);
  }

  async submitTurn(sessionId: string, userId: string, content: string): Promise<StorySessionView> {
    const state = await this.requireState(sessionId);
    if (state.phase !== "running") {
      throw new Error("session_not_running");
    }
    const isBoyTurn = state.currentRound % 2 !== 0;
    const expectedUser = isBoyTurn ? state.roles.boy : state.roles.girl;
    if (!expectedUser || expectedUser !== userId) {
      throw new Error("not_your_turn");
    }

    state.lines.push({ userId, content, roundIdx: state.currentRound });
    state.lastActivityMs = Date.now();

    if (state.currentRound >= state.config.turns) {
      state.phase = "completed";
      state.turnDeadline = null;
      this.computeWinner(state);
      await this.prisma.activitySession.update({
        where: { id: sessionId },
        data: { status: "ended", endedAt: new Date() },
      });
    } else {
      state.currentRound += 1;
      state.turnDeadline = Date.now() + state.config.turnSeconds * 1000;
    }

    await this.saveState(sessionId, state);
    return this.publishUpdate(sessionId, state);
  }

  async scoreLine(sessionId: string, userId: string, roundIdx: number, score: number): Promise<StorySessionView> {
    const state = await this.requireState(sessionId);
    const line = state.lines.find((entry) => entry.roundIdx === roundIdx);
    if (!line) {
      throw new Error("line_not_found");
    }
    if (line.userId === userId) {
      throw new Error("cannot_score_own_line");
    }
    line.score = score;
    state.lastActivityMs = Date.now();
    await this.saveState(sessionId, state);
    return this.publishUpdate(sessionId, state);
  }

  async handleTimerElapsed(sessionId: string, marker: number): Promise<void> {
    if (marker !== COUNTDOWN_TIMER_INDEX) {
      return;
    }
    const state = await this.loadOrRebuildState(sessionId, { triggerElapsedCountdown: false });
    if (!state || state.phase !== "countdown") {
      return;
    }
    this.countdownHandles.delete(sessionId);
    state.countdown = null;
    state.phase = "running";
    state.scenario = state.scenario ?? SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    state.currentRound = 1;
    state.turnDeadline = Date.now() + state.config.turnSeconds * 1000;
    state.lastActivityMs = Date.now();
    await this.prisma.activitySession.update({
      where: { id: sessionId },
      data: { status: "running", startedAt: new Date() },
    });
    await this.saveState(sessionId, state);
    await this.publishUpdate(sessionId, state);
  }

  private async ensureActivity(): Promise<string> {
    const activity = await this.prisma.activity.upsert({
      where: { key: STORY_ACTIVITY_KEY },
      update: {},
      create: {
        key: STORY_ACTIVITY_KEY,
        name: "Story Builder",
        configJson: {},
      },
    });
    return activity.id;
  }

  private async loadState(sessionId: string): Promise<StoryState | null> {
    const raw = await this.redis.get(SESSION_KEY(sessionId));
    if (!raw) {
      return null;
    }
    return this.normalizeState(JSON.parse(raw) as Partial<StoryState>);
  }

  private async rebuildLobbyState(sessionId: string): Promise<StoryState | null> {
    const session = await this.prisma.activitySession.findUnique({
      where: { id: sessionId },
      include: {
        participants: { select: { userId: true }, orderBy: { joinedAt: "asc" } },
        activity: { select: { key: true, configJson: true } },
      },
    });
    if (!session || session.activity.key !== STORY_ACTIVITY_KEY || session.status === "ended") {
      return null;
    }

    const participants = session.participants.map((p) => p.userId);
    if (participants.length === 0) {
      return null;
    }

    const metadata = session.metadataJson as { creatorUserId?: string; config?: StoryState["config"] } | null;
    const config = {
      turns: metadata?.config?.turns ?? 6,
      turnSeconds: metadata?.config?.turnSeconds ?? 60,
      countdownMs: metadata?.config?.countdownMs ?? DEFAULT_COUNTDOWN_MS,
    };
    const creatorUserId = metadata?.creatorUserId ?? participants[0];
    const readyMap = Object.fromEntries(participants.map((userId) => [userId, false]));
    const joinedMap = Object.fromEntries(participants.map((userId) => [userId, userId === creatorUserId]));

    const rebuilt: StoryState = {
      phase: "lobby",
      roles: {},
      scenario: null,
      lines: [],
      currentRound: 0,
      turnDeadline: null,
      participants,
      creatorUserId,
      config,
      readyMap,
      joinedMap,
      countdown: null,
      lastActivityMs: Date.now(),
    };

    await this.saveState(sessionId, rebuilt);
    return rebuilt;
  }

  private async saveState(sessionId: string, state: StoryState): Promise<void> {
    await this.redis.set(SESSION_KEY(sessionId), JSON.stringify(state));
  }

  private async loadOrRebuildState(sessionId: string, opts?: { triggerElapsedCountdown?: boolean }): Promise<StoryState | null> {
    const state = await this.loadState(sessionId);
    if (state) {
      const maybeUpdated = await this.resumeCountdownIfNeeded(sessionId, state, opts);
      return maybeUpdated ?? state;
    }
    const rebuilt = await this.rebuildLobbyState(sessionId);
    if (rebuilt) {
      const maybeUpdated = await this.resumeCountdownIfNeeded(sessionId, rebuilt, opts);
      return maybeUpdated ?? rebuilt;
    }
    return null;
  }

  private async resumeCountdownIfNeeded(
    sessionId: string,
    state: StoryState,
    opts?: { triggerElapsedCountdown?: boolean },
  ): Promise<StoryState | null> {
    if (state.phase !== "countdown" || !state.countdown) {
      return state;
    }
    const remainingMs = state.countdown.endsAt - Date.now();
    if (remainingMs <= 0) {
      if (opts?.triggerElapsedCountdown ?? true) {
        await this.handleTimerElapsed(sessionId, COUNTDOWN_TIMER_INDEX);
        return this.loadState(sessionId);
      }
      return state;
    }
    if (this.countdownHandles.has(sessionId)) {
      return state;
    }
    const handle = this.scheduler.schedule(sessionId, COUNTDOWN_TIMER_INDEX, remainingMs);
    this.countdownHandles.set(sessionId, handle);
    return state;
  }

  private async requireState(sessionId: string): Promise<StoryState> {
    const state = await this.loadOrRebuildState(sessionId);
    if (!state) {
      throw new Error(`session_state_missing:${sessionId}`);
    }
    return state;
  }

  private mapStatus(current: "pending" | "running" | "ended", phase: StoryPhase): "pending" | "running" | "ended" {
    if (current === "ended" || phase === "completed") {
      return "ended";
    }
    if (current === "running" || phase === "running" || phase === "countdown") {
      return "running";
    }
    return "pending";
  }

  private buildParticipantView(state: StoryState): StoryParticipantView[] {
    return state.participants.map((userId) => ({
      userId,
      ready: !!state.readyMap[userId],
      joined: !!state.joinedMap[userId],
      role:
        state.roles.boy === userId
          ? "boy"
          : state.roles.girl === userId
          ? "girl"
          : undefined,
    }));
  }

  private mapToView(sessionId: string, state: StoryState): StorySessionView {
    const status: "pending" | "running" | "ended" =
      state.phase === "completed"
        ? "ended"
        : state.phase === "running" || state.phase === "countdown"
        ? "running"
        : "pending";
    return {
      sessionId,
      activityKey: STORY_ACTIVITY_KEY,
      status,
      phase: state.phase,
      participants: this.buildParticipantView(state),
      creatorUserId: state.creatorUserId,
      countdown: state.countdown,
      meta: {
        roles: state.roles,
        scenario: state.scenario,
        lines: state.lines,
        currentRound: state.currentRound,
        turnDeadline: state.turnDeadline,
        winner: state.winner,
        config: {
          turns: state.config.turns,
          turnSeconds: state.config.turnSeconds,
        },
      },
    };
  }

  private async publishUpdate(sessionId: string, state: StoryState): Promise<StorySessionView> {
    const view = this.mapToView(sessionId, state);
    await this.publisher.publish({ name: "story.session.updated", payload: { sessionId, view } });
    return view;
  }

  private everyoneReady(state: StoryState): boolean {
    return state.participants.every((userId) => !!state.readyMap[userId]);
  }

  private rolesFilled(state: StoryState): boolean {
    return Boolean(state.roles.boy && state.roles.girl);
  }

  private async beginCountdown(sessionId: string, state: StoryState): Promise<void> {
    if (state.phase === "running" || state.phase === "completed" || state.phase === "countdown") {
      return;
    }
    state.phase = "countdown";
    const startedAt = Date.now();
    const durationMs = state.config.countdownMs;
    state.countdown = { startedAt, durationMs, endsAt: startedAt + durationMs };
    const handle = this.scheduler.schedule(sessionId, COUNTDOWN_TIMER_INDEX, durationMs);
    this.countdownHandles.set(sessionId, handle);
    state.lastActivityMs = Date.now();
    await this.saveState(sessionId, state);
    await this.publisher.publish({
      name: "activity.session.countdown",
      payload: {
        sessionId,
        countdown: state.countdown,
      },
    });
  }

  private async cancelCountdown(sessionId: string, state: StoryState, reason: string): Promise<void> {
    const handle = this.countdownHandles.get(sessionId);
    if (handle) {
      handle.cancel();
      this.countdownHandles.delete(sessionId);
    }
    state.countdown = null;
    state.phase = "role_selection";
    state.lastActivityMs = Date.now();
    await this.saveState(sessionId, state);
    await this.publisher.publish({
      name: "activity.session.countdown.cancelled",
      payload: { sessionId, reason },
    });
  }

  private ensureParticipant(state: StoryState, userId: string): void {
    if (!state.participants.includes(userId)) {
      throw new Error("participant_not_in_session");
    }
  }

  private computeWinner(state: StoryState): void {
    let boyScore = 0;
    let girlScore = 0;
    for (const line of state.lines) {
      const delta = line.score ?? 0;
      if (line.roundIdx % 2 !== 0) {
        boyScore += delta;
      } else {
        girlScore += delta;
      }
    }
    if (boyScore > girlScore) {
      state.winner = "boy";
    } else if (girlScore > boyScore) {
      state.winner = "girl";
    } else {
      state.winner = "tie";
    }
  }

  private normalizeState(raw: Partial<StoryState>): StoryState {
    const participants = Array.isArray(raw.participants) && raw.participants.length > 0 ? raw.participants : [];
    const readyMap = raw.readyMap ?? Object.fromEntries(participants.map((userId) => [userId, false]));
    const joinedMap = raw.joinedMap ?? Object.fromEntries(participants.map((userId) => [userId, false]));
    return {
      phase: raw.phase ?? "lobby",
      roles: raw.roles ?? {},
      scenario: raw.scenario ?? null,
      lines: Array.isArray(raw.lines) ? raw.lines : [],
      currentRound: typeof raw.currentRound === "number" ? raw.currentRound : 0,
      turnDeadline: typeof raw.turnDeadline === "number" ? raw.turnDeadline : null,
      participants,
      creatorUserId: raw.creatorUserId ?? participants[0] ?? "",
      winner: raw.winner,
      config: {
        turns: raw.config?.turns ?? 6,
        turnSeconds: raw.config?.turnSeconds ?? 60,
        countdownMs: raw.config?.countdownMs ?? DEFAULT_COUNTDOWN_MS,
      },
      readyMap,
      joinedMap,
      countdown: raw.countdown ?? null,
      lastActivityMs: typeof raw.lastActivityMs === "number" ? raw.lastActivityMs : Date.now(),
    };
  }
}
