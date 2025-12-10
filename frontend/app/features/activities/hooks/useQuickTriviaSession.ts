import { useEffect, useRef, useState, useCallback } from "react";
import { readAuthSnapshot } from "@/lib/auth-storage";
import { getSelf, joinSession, leaveSession, setSessionReady } from "../api/client";
import { recordGameOutcome } from "@/lib/leaderboards";

export interface TriviaState {
  phase: "idle" | "connecting" | "lobby" | "running" | "ended" | "error" | "countdown";
  sessionId?: string;
  activityKey?: "quick_trivia";
  currentRound?: number;
  timeLimitMs?: number;
  question?: string;
  options?: string[];
  selectedIndex?: number;
  correctIndex?: number;
  locked?: boolean;
  winnerUserId?: string;
  scoreboard: Array<{ userId: string; score: number }>;
  tieBreakWinnerUserId?: string;
  presence?: Array<{ userId: string; joined: boolean; ready: boolean }>;
  lobbyReady?: boolean;
  countdown?: {
    startedAt: number;
    durationMs: number;
    endsAt: number;
    reason?: "lobby" | "intermission";
    nextRoundIndex?: number;
  };
  tally?: Record<string, { correct: number; wrong: number }>;
  error?: string;
  leaveReason?: string;
}

const CORE_BASE = (process.env.NEXT_PUBLIC_ACTIVITIES_CORE_URL || "/api").replace(/\/$/, "");
type QuickTriviaLogLevel = "info" | "warn" | "error";
const QUICK_TRIVIA_LOGGERS: Record<QuickTriviaLogLevel, (...args: unknown[]) => void> = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
const QUICK_TRIVIA_FALLBACK_LOGGER = console.info.bind(console);
const logQuickTrivia = (level: QuickTriviaLogLevel, message: string, meta?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  const ts = new Date().toISOString();
  const payload = meta ?? {};
  const logger = QUICK_TRIVIA_LOGGERS[level] ?? QUICK_TRIVIA_FALLBACK_LOGGER;
  logger(`[quick_trivia] ${ts} ${message}`, payload);
};

export function useQuickTriviaSession(opts: { sessionId?: string }) {
  const [state, setState] = useState<TriviaState>({ phase: "idle", scoreboard: [] });
  const stateRef = useRef(state);
  const [, forceTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const roundStartMsRef = useRef<number | null>(null);
  const selfRef = useRef<string>(getSelf());
  const sessionIdRef = useRef<string | null>(null);
  const joinedRef = useRef(false);
  const expiredRef = useRef(false);
  const socketCleanupRef = useRef<(() => void) | null>(null);
  const outcomeRecordedRef = useRef(false);

  const isSessionGone = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return (
      message.includes("410") ||
      message.toLowerCase().includes("gone") ||
      message.includes("session_not_found") ||
      message.includes("session_state_missing")
    );
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const markSessionExpired = useCallback((message: string) => {
    joinedRef.current = false;
    sessionIdRef.current = null;
    expiredRef.current = true;
    logQuickTrivia("info", "marking session expired", { reason: message });
    socketCleanupRef.current?.();
    socketCleanupRef.current = null;
    const socket = wsRef.current;
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    setState((s) => ({
      ...s,
      sessionId: undefined,
      phase: "ended",
      error: message,
      countdown: undefined,
      presence: [],
      scoreboard: [],
    }));
  }, []);

  useEffect(() => {
    if (!opts.sessionId) {
      sessionIdRef.current = null;
      joinedRef.current = false;
      expiredRef.current = false;
      setState({ phase: "idle", scoreboard: [] });
    }
  }, [opts.sessionId]);

  useEffect(() => {
    if (!opts.sessionId) return;
    let cancelled = false;
    sessionIdRef.current = opts.sessionId;
    joinedRef.current = false;
    expiredRef.current = false;
    setState((s) => ({ ...s, phase: "connecting", sessionId: opts.sessionId, error: undefined }));
    const self = getSelf();
    selfRef.current = self;

    const joinWithRetry = async () => {
      const maxAttempts = 5;
      let attempt = 0;
      let lastError: unknown = null;
      while (attempt < maxAttempts && !cancelled) {
        try {
          if (expiredRef.current || !sessionIdRef.current) {
            throw new Error("session_expired");
          }
          await joinSession(opts.sessionId!, self);
          joinedRef.current = true;
          logQuickTrivia("info", "joined quick trivia session", { sessionId: opts.sessionId, attempt: attempt + 1 });
          return true;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : "";
          if (isSessionGone(error)) {
            throw new Error("session_expired");
          }
          if (!message.includes("participant_not_found")) {
            throw error;
          }
          const delay = 200 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt += 1;
        }
      }
      if (lastError) {
        throw lastError;
      }
      throw new Error("join_failed");
    };

    const openStream = async () => {
      try {
        await joinWithRetry();
        if (cancelled || expiredRef.current) return;
        const auth = readAuthSnapshot();
        const token = auth?.access_token;
        const streamUrl = resolveStreamUrl(opts.sessionId!, token, self);
        const ws = new WebSocket(streamUrl);
        wsRef.current = ws;

        const handleOpen = () => {
          logQuickTrivia("info", "websocket opened", { sessionId: opts.sessionId });
          setState((s) => ({ ...s, phase: "lobby" }));
        };

        const handleMessage = (evt: MessageEvent) => {
          try {
            const msg = JSON.parse(evt.data);
            const type = msg?.type;
            if (!type) return;
            const sessionId = sessionIdRef.current;
            const inboundSessionId: string | undefined = msg.sessionId || msg.payload?.sessionId;
            if (sessionId && inboundSessionId && inboundSessionId !== sessionId) {
              logQuickTrivia("warn", "ignoring websocket event for stale session", { expected: sessionId, got: inboundSessionId, type });
              return;
            }
            if (expiredRef.current && (type === "activity.round.started" || type === "activity.session.started")) {
              logQuickTrivia("warn", "ignoring round/session start after expiration", { sessionId, type });
              return;
            }

            if (type === "session.snapshot") {
              const payload = msg.payload || {};
              const snapshotParticipants = Array.isArray(payload?.scoreboard?.participants)
                ? payload.scoreboard.participants
                : Array.isArray(payload?.participants)
                ? payload.participants
                : undefined;
              const tieBreakWinnerUserId = payload?.tieBreak?.winnerUserId || payload?.tieBreakWinnerUserId;
              const winnerFromSnapshot = tieBreakWinnerUserId || payload?.winnerUserId || payload?.scoreboard?.winnerUserId;
              setState((s) => ({
                ...s,
                phase: payload.lobbyPhase ? "lobby" : payload.status === "running" ? "running" : payload.status === "ended" ? "ended" : s.phase,
                presence: payload.presence || s.presence,
                lobbyReady: payload.lobbyReady ?? s.lobbyReady,
                countdown: payload.countdown || undefined,
                scoreboard:
                  snapshotParticipants && snapshotParticipants.length > 0
                    ? mergeSnapshot([], snapshotParticipants)
                    : s.scoreboard,
                tally: payload.tally || s.tally,
                currentRound: typeof payload.currentRoundIndex === "number" ? payload.currentRoundIndex : s.currentRound,
                winnerUserId: winnerFromSnapshot ?? s.winnerUserId,
                tieBreakWinnerUserId: tieBreakWinnerUserId ?? s.tieBreakWinnerUserId,
              }));
              if (payload.status === "ended") {
                logQuickTrivia("warn", "received snapshot for ended session", { sessionId });
                const shouldExpire = !expiredRef.current && stateRef.current.phase !== "ended";
                if (shouldExpire) {
                  markSessionExpired("Session expired, please start a new one.");
                }
              }
              return;
            }

            if (type === "activity.session.presence") {
              setState((s) => ({
                ...s,
                presence: msg.payload?.participants || s.presence,
                lobbyReady: msg.payload?.lobbyReady ?? s.lobbyReady,
                phase: s.phase === "idle" ? "lobby" : s.phase,
              }));
              return;
            }

            if (type === "activity.session.countdown") {
              const payload = msg.payload || {};
              logQuickTrivia("info", "received countdown", { sessionId, endsAt: payload.endsAt });
              setState((s): TriviaState => ({
                ...s,
                phase: "lobby",
                countdown: { startedAt: payload.startedAt, durationMs: payload.durationMs, endsAt: payload.endsAt },
              }));
              return;
            }

            if (type === "activity.session.countdown.cancelled") {
              logQuickTrivia("info", "countdown cancelled", { sessionId });
              setState((s): TriviaState => ({ ...s, phase: "lobby", countdown: undefined }));
              return;
            }

            if (type === "activity.session.started") {
              logQuickTrivia("info", "session started", { sessionId, currentRound: msg.payload?.currentRound });
              setState((s) => ({
                ...s,
                phase: "running",
                currentRound: typeof msg.payload?.currentRound === "number" ? msg.payload.currentRound : s.currentRound,
                countdown: undefined,
              }));
              return;
            }

            if (type === "activity.round.started") {
              const payload = msg.payload?.payload || msg.payload;
              const index = msg.payload?.index ?? payload?.index;
              roundStartMsRef.current = Date.now();
              logQuickTrivia("info", "round started", { sessionId, roundIndex: index });
              setState((s) => ({
                ...s,
                phase: "running",
                activityKey: "quick_trivia",
                currentRound: index,
                timeLimitMs: payload?.timeLimitMs,
                question: payload?.question,
                options: payload?.options || [],
                selectedIndex: undefined,
                correctIndex: undefined,
                locked: false,
                countdown: undefined,
              }));
              return;
            }

            if (type === "activity.score.updated") {
              const { userId, total } = msg.payload;
              setState((s) => ({ ...s, scoreboard: mergeScore(s.scoreboard, userId, total) }));
              return;
            }

            if (type === "activity.round.ended") {
              const correctIndex = msg.payload?.correctIndex;
              const roundBoard = msg.payload?.scoreboard?.participants;
              logQuickTrivia("info", "round ended", { sessionId, roundIndex: msg.payload?.index });
              setState((s) => ({
                ...s,
                correctIndex,
                locked: true,
                scoreboard: Array.isArray(roundBoard) && roundBoard.length > 0 ? mergeSnapshot(s.scoreboard, roundBoard) : s.scoreboard,
              }));
              return;
            }

            if (type === "activity.session.ended") {
              logQuickTrivia("info", "session ended", { sessionId });
              const finalBoard = msg.payload?.finalScoreboard?.participants;
              const winnerFromBoard = msg.payload?.finalScoreboard?.winnerUserId;
              const directWinner = msg.payload?.winnerUserId;
              const tieBreakWinnerUserId = msg.payload?.tieBreak?.winnerUserId || msg.payload?.tieBreakWinnerUserId;
              const resolvedWinner = tieBreakWinnerUserId || directWinner || winnerFromBoard;
              const leaveReason = msg.payload?.reason === 'opponent_left' ? 'opponent_left' : undefined;
              const shouldShowExpiredMessage = (() => {
                const snapshot = stateRef.current;
                return snapshot.phase === "idle" || snapshot.phase === "lobby" || (snapshot.phase as string) === "countdown";
              })();
              if (shouldShowExpiredMessage) {
                markSessionExpired("Session expired, please start a new one.");
                return;
              }
              setState((s) => ({
                ...s,
                phase: "ended",
                winnerUserId: resolvedWinner,
                tieBreakWinnerUserId,
                tally: msg.payload?.tally || s.tally,
                scoreboard: Array.isArray(finalBoard) && finalBoard.length > 0 ? mergeSnapshot(s.scoreboard, finalBoard) : s.scoreboard,
                leaveReason,
              }));
              return;
            }
          } catch (err) {
            logQuickTrivia("warn", "failed to process websocket message", { error: err instanceof Error ? err.message : err });
          }
        };

        const handleError = () => {
          if (expiredRef.current) return;
          logQuickTrivia("warn", "websocket error", { sessionId: opts.sessionId });
          setState((s) => ({ ...s, phase: "ended" }));
        };

        const handleClose = () => {
          if (expiredRef.current) return;
          logQuickTrivia("info", "websocket closed", { sessionId: opts.sessionId });
          setState((s) => ({ ...s, phase: "ended" }));
        };

        ws.addEventListener("open", handleOpen);
        ws.addEventListener("message", handleMessage);
        ws.addEventListener("error", handleError);
        ws.addEventListener("close", handleClose);

        socketCleanupRef.current = () => {
          ws.removeEventListener("open", handleOpen);
          ws.removeEventListener("message", handleMessage);
          ws.removeEventListener("error", handleError);
          ws.removeEventListener("close", handleClose);
        };
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "join_failed";
        if (message === "session_expired" || isSessionGone(error)) {
          markSessionExpired("Session expired, please start a new one.");
          return;
        }
        setState((s) => ({ ...s, phase: "error", error: message }));
      }
    };

    void openStream();

    return () => {
      cancelled = true;
      socketCleanupRef.current?.();
      socketCleanupRef.current = null;
      const socket = wsRef.current;
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore close issues
        }
      }
      wsRef.current = null;
      const currentSessionId = sessionIdRef.current;
      if (currentSessionId && joinedRef.current && !expiredRef.current) {
        joinedRef.current = false;
        void leaveSession(currentSessionId, selfRef.current).catch(() => undefined);
      }
      sessionIdRef.current = null;
    };
  }, [opts.sessionId, isSessionGone, markSessionExpired]);

  const selectOption = useCallback((idx: number) => {
    setState((s) => {
      if (s.locked || s.phase !== "running" || s.selectedIndex !== undefined) return s;
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "submit", payload: { choiceIndex: idx, userId: selfRef.current, tClientMs: Date.now() } }));
      }
      return { ...s, selectedIndex: idx, locked: true };
    });
  }, []);

  const toggleReady = useCallback(
    (ready: boolean) => {
      if (!state.sessionId) return;
      const self = selfRef.current;
      logQuickTrivia("info", "toggle ready", { sessionId: state.sessionId, ready });
      void setSessionReady(state.sessionId, self, ready).catch(() => {});
      setState((s) => ({ ...s, presence: updatePresenceReady(s.presence, self, ready), lobbyReady: ready ? s.lobbyReady : false }));
    },
    [state.sessionId],
  );

  useEffect(() => {
    if (state.phase !== "running" || !state.timeLimitMs || !roundStartMsRef.current) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - (roundStartMsRef.current || 0);
      if (elapsed >= (state.timeLimitMs || 0) && !state.locked) {
        setState((s) => ({ ...s, locked: true }));
      }
    }, 250);
    return () => clearInterval(id);
  }, [state.phase, state.timeLimitMs, state.locked]);

  useEffect(() => {
    if (state.phase !== "running" && !state.countdown) return;
    const id = setInterval(() => {
      forceTick((tick) => (tick + 1) % 1_000_000);
    }, 250);
    return () => clearInterval(id);
  }, [state.phase, state.countdown, state.countdown?.endsAt, state.countdown?.startedAt, state.currentRound]);

  const remainingMs = state.phase === "running" && state.timeLimitMs && roundStartMsRef.current
    ? Math.max(state.timeLimitMs - (Date.now() - roundStartMsRef.current), 0)
    : 0;
  const progress = state.timeLimitMs ? 1 - remainingMs / state.timeLimitMs : 0;
  const countdownRemainingMs = state.countdown ? Math.max(state.countdown.endsAt - Date.now(), 0) : 0;

  const leave = useCallback(async () => {
    const sessionId = state.sessionId;
    const self = selfRef.current;
    if (!sessionId || !self) return;
    
    // Send leave via WebSocket first for immediate feedback
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'leave',
        payload: { userId: self }
      }));
    }
    
    // Also call REST API as backup
    try {
      await leaveSession(sessionId, self);
    } catch {
      // Ignore errors, websocket should handle it
    }
  }, [state.sessionId]);

  // Record game outcome when finished
  useEffect(() => {
    if (state.phase !== 'ended' || outcomeRecordedRef.current) {
      return;
    }
    outcomeRecordedRef.current = true;

    // Get participants
    const participants = state.scoreboard.map(p => p.userId);
    if (participants.length < 1) {
      return;
    }

    // Determine winner
    const winnerId = state.winnerUserId ?? (state.scoreboard.length > 0 ? state.scoreboard[0].userId : null);

    // Record the outcome
    recordGameOutcome({
      userIds: participants,
      winnerId,
      gameKind: 'quick_trivia',
      durationSeconds: 60, // Default estimate
    }).catch((err) => {
      console.error('Failed to record game outcome:', err);
    });
  }, [state.phase, state.scoreboard, state.winnerUserId]);

  return { state, selectOption, toggleReady, leave, progress, countdownRemainingMs, questionMsRemaining: remainingMs, self: selfRef.current };
}

function mergeScore(list: Array<{ userId: string; score: number }>, userId: string, score: number) {
  const next = list.map((entry) => (entry.userId === userId ? { ...entry, score } : entry));
  if (next.some((entry) => entry.userId === userId)) {
    return next;
  }
  return [...next, { userId, score }];
}

function mergeSnapshot(list: Array<{ userId: string; score: number }>, snapshot: Array<{ userId: string; score: number }>) {
  const merged = new Map<string, number>();
  for (const entry of list) {
    merged.set(entry.userId, entry.score);
  }
  for (const entry of snapshot) {
    merged.set(entry.userId, entry.score);
  }
  return Array.from(merged.entries()).map(([userId, score]) => ({ userId, score }));
}

function updatePresenceReady(
  presence: Array<{ userId: string; joined: boolean; ready: boolean }> | undefined,
  userId: string,
  ready: boolean,
) {
  if (!presence) return presence;
  return presence.map((entry) => (entry.userId === userId ? { ...entry, ready: ready || false, joined: true } : entry));
}

function resolveStreamUrl(sessionId: string, token?: string, userId?: string): string {
  const isAbsolute = CORE_BASE.startsWith("http://") || CORE_BASE.startsWith("https://");
  let origin: string;
  if (isAbsolute) {
    origin = CORE_BASE.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  } else if (typeof window !== "undefined") {
    const { origin: currentOrigin } = window.location;
    const wsOrigin = currentOrigin.startsWith("https://")
      ? `wss://${currentOrigin.slice("https://".length)}`
      : currentOrigin.startsWith("http://")
      ? `ws://${currentOrigin.slice("http://".length)}`
      : `ws://${currentOrigin}`;
    const prefix = CORE_BASE ? (CORE_BASE.startsWith("/") ? CORE_BASE : `/${CORE_BASE}`) : "";
    origin = `${wsOrigin}${prefix}`;
  } else {
    const prefix = CORE_BASE ? (CORE_BASE.startsWith("/") ? CORE_BASE : `/${CORE_BASE}`) : "";
    origin = `ws://localhost${prefix}`;
  }
  const base = `${origin}/activities/session/${sessionId}/stream`;
  const params: Record<string, string> = {};
  if (token) {
    params.authToken = token;
  }
  if (userId) {
    params.userId = userId;
  }
  const keys = Object.keys(params);
  if (keys.length === 0) {
    return base;
  }
  const query = keys.map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join("&");
  const glue = base.includes("?") ? (base.endsWith("?") ? "" : "&") : "?";
  return `${base}${glue}${query}`;
}
