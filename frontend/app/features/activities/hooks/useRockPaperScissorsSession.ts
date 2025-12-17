"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readAuthSnapshot } from "@/lib/auth-storage";
import { getSelf, joinSession, leaveSession, setSessionReady } from "../api/client";
import { resetOutcomeGuard } from "./outcome-recorder";

export type RpsChoice = "rock" | "paper" | "scissors";
type ScoreEntry = { userId: string; score: number };
const compareScoreDesc = (a: ScoreEntry, b: ScoreEntry) => b.score - a.score;

function resolveLeaveReason(reason?: string | null): RockPaperScissorsState['leaveReason'] {
  if (!reason) return null;
  if (reason === 'opponent_left') return 'opponent_left';
  return reason as RockPaperScissorsState['leaveReason'];
}

export type RockPaperScissorsPhase = "idle" | "connecting" | "lobby" | "countdown" | "running" | "ended" | "error";

export interface RockPaperScissorsState {
  phase: RockPaperScissorsPhase;
  sessionId?: string;
  countdown?: { startedAt: number; durationMs: number; endsAt: number; reason?: string };
  presence: Array<{ userId: string; joined: boolean; ready: boolean }>;
  scoreboard: ScoreEntry[];
  currentRound?: number;
  winnerUserId?: string;
  lastRoundWinner?: string;
  lastRoundMoves?: Array<{ userId: string; move?: RpsChoice | null }>;
  lastRoundReason?: string;
  submittedMove?: RpsChoice | null;
  error?: string;
  leaveReason?: 'opponent_left' | 'forfeit' | null;
}

const CORE_BASE = (process.env.NEXT_PUBLIC_ACTIVITIES_CORE_URL || "/api").replace(/\/$/, "");

const initialState: RockPaperScissorsState = {
  phase: "idle",
  presence: [],
  scoreboard: [],
};

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
  if (token) params.authToken = token;
  if (userId) params.userId = userId;
  const keys = Object.keys(params);
  if (keys.length === 0) {
    return base;
  }
  const query = keys.map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join("&");
  const glue = base.includes("?") ? (base.endsWith("?") ? "" : "&") : "?";
  return `${base}${glue}${query}`;
}

function mergeScoreboard(scoreboard: ScoreEntry[], userId: string, score: number): ScoreEntry[] {
  const existing = new Map(scoreboard.map((entry) => [entry.userId, entry.score]));
  existing.set(userId, score);
  return Array.from(existing.entries())
    .map(([id, total]) => ({ userId: id, score: total }))
    .sort(compareScoreDesc);
}

export function useRockPaperScissorsSession(opts: { sessionId?: string }) {
  const [state, setState] = useState<RockPaperScissorsState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const joinedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const selfIdRef = useRef<string>(getSelf());
  const outcomeRecordedRef = useRef(false);

  useEffect(() => {
    selfIdRef.current = getSelf();
  }, []);

  useEffect(() => {
    if (!opts.sessionId) {
      sessionIdRef.current = null;
      joinedRef.current = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
      const socket = wsRef.current;
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      setState(initialState);
    }
  }, [opts.sessionId]);

  useEffect(() => {
    if (!opts.sessionId) return;
    let cancelled = false;
    const sessionId = opts.sessionId;
    sessionIdRef.current = sessionId;
    joinedRef.current = false;
    setState((prev) => ({
      ...initialState,
      sessionId,
      phase: "connecting",
      presence: prev.presence,
    }));
    const selfId = getSelf();
    selfIdRef.current = selfId;

    const joinWithRetry = async () => {
      const maxAttempts = 5;
      let attempt = 0;
      let lastError: unknown = null;
      while (attempt < maxAttempts && !cancelled) {
        try {
          await joinSession(sessionId, selfId);
          joinedRef.current = true;
          return true;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : "";
          if (message.includes("session_not_found")) {
            throw new Error("session_expired");
          }
          if (!message.includes("participant_not_found") && !message.includes("session_state_missing")) {
            throw error;
          }
          const delay = 200 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt += 1;
        }
      }
      if (lastError) {
        if (lastError instanceof Error && lastError.message.includes("session_state_missing")) {
          throw new Error("session_expired");
        }
        throw lastError;
      }
      throw new Error("join_failed");
    };

    const openStream = async () => {
      try {
        await joinWithRetry();
        if (cancelled) return;
        const token = readAuthSnapshot()?.access_token;
        const wsUrl = resolveStreamUrl(sessionId, token, selfId);
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        const handleOpen = () => {
          setState((prev) => ({ ...prev, phase: prev.phase === "connecting" ? "lobby" : prev.phase }));
        };

        const handleClose = () => {
          if (!cancelled) {
            setState((prev) => ({ ...prev, phase: prev.phase === "ended" ? "ended" : "error", error: prev.error ?? "Session disconnected" }));
          }
        };

        const handleMessage = (event: MessageEvent) => {
          try {
            const payload = JSON.parse(event.data);
            const type = payload?.type;
            if (!type) {
              return;
            }
            if (type === "session.snapshot") {
              const snapshot = payload.payload || {};
              // Convert countdown value (number) to countdown object
              const countdownValue = snapshot.countdown;
              const countdownObj = typeof countdownValue === "number" && countdownValue > 0
                ? {
                  startedAt: Date.now(),
                  durationMs: countdownValue * 1000,
                  endsAt: Date.now() + countdownValue * 1000,
                }
                : undefined;
              setState((prev) => ({
                ...prev,
                phase:
                  snapshot.lobbyPhase ?? snapshot.status === "pending"
                    ? "lobby"
                    : snapshot.status === "countdown"
                      ? "countdown"
                      : snapshot.status === "running"
                        ? "running"
                        : snapshot.status === "ended"
                          ? "ended"
                          : prev.phase,
                presence: snapshot.presence ?? prev.presence,
                countdown: countdownObj ?? prev.countdown,
                scoreboard: snapshot.participants
                  ? snapshot.participants.map((entry: { userId: string; score: number }) => ({
                    userId: entry.userId,
                    score: entry.score,
                  }))
                  : prev.scoreboard,
                currentRound: typeof snapshot.currentRoundIndex === "number" ? snapshot.currentRoundIndex : prev.currentRound,
              }));
              return;
            }

            if (type === "activity.session.presence") {
              setState((prev) => ({
                ...prev,
                presence: payload.payload?.participants ?? prev.presence,
                lobbyReady: payload.payload?.lobbyReady,
                phase: prev.phase === "connecting" ? "lobby" : prev.phase,
              }));
              return;
            }

            if (type === "activity.session.countdown") {
              setState((prev) => ({
                ...prev,
                phase: "countdown",
                countdown: payload.payload ? { ...payload.payload } : undefined,
              }));
              return;
            }

            if (type === "activity.session.countdown.cancelled") {
              setState((prev) => ({
                ...prev,
                phase: "lobby",
                countdown: undefined,
              }));
              return;
            }

            if (type === "activity.round.started") {
              const roundIndex = payload.payload?.index ?? payload.payload?.round ?? 0;
              console.log("[RPS Hook] Round started:", roundIndex);

              // Delay clearing round data to give UI time to show the result
              // The round result was shown when activity.round.ended arrived
              // We wait 100ms before transitioning to ensure smooth UX
              setTimeout(() => {
                setState((prev) => {
                  // Only clear if we're still on running phase (not ended)
                  if (prev.phase !== "running" && prev.phase !== "countdown") {
                    return prev;
                  }
                  return {
                    ...prev,
                    phase: "running",
                    currentRound: roundIndex,
                    countdown: undefined,
                    submittedMove: null,
                    // Clear round data so UI shows move selection
                    lastRoundWinner: undefined,
                    lastRoundMoves: undefined,
                    lastRoundReason: undefined,
                  };
                });
              }, 100);
              return;
            }

            if (type === "activity.score.updated") {
              const { userId, total } = payload.payload || {};
              if (typeof userId === "string" && typeof total === "number") {
                setState((prev) => ({
                  ...prev,
                  scoreboard: mergeScoreboard(prev.scoreboard, userId, total),
                }));
              }
              return;
            }

            if (type === "activity.round.ended") {
              console.log("[RPS Hook] Round ended - winner:", payload.payload?.winnerUserId, "moves:", payload.payload?.moves);
              const scoreboardPayload = payload.payload?.scoreboard?.participants;
              setState((prev) => ({
                ...prev,
                phase: prev.phase === "running" ? "running" : prev.phase,
                scoreboard: Array.isArray(scoreboardPayload)
                  ? scoreboardPayload.map((entry: ScoreEntry) => ({ userId: entry.userId, score: entry.score })).sort(compareScoreDesc)
                  : prev.scoreboard,
                lastRoundWinner: payload.payload?.winnerUserId ?? undefined,
                lastRoundMoves: payload.payload?.moves ?? prev.lastRoundMoves,
                lastRoundReason: payload.payload?.reason ?? prev.lastRoundReason,
                // Clear submitted move so UI can show round result
                submittedMove: null,
              }));
              return;
            }

            if (type === "activity.session.ended") {
              setState((prev) => ({
                ...prev,
                phase: "ended",
                countdown: undefined,
                winnerUserId: payload.payload?.winnerUserId ?? payload.payload?.finalScoreboard?.winnerUserId,
                scoreboard: payload.payload?.finalScoreboard?.participants
                  ? payload.payload.finalScoreboard.participants.map((entry: ScoreEntry) => ({ userId: entry.userId, score: entry.score })).sort(compareScoreDesc)
                  : prev.scoreboard,
                leaveReason: resolveLeaveReason(payload.payload?.leaveReason ?? payload.payload?.reason),
              }));
              return;
            }

            if (type === "error") {
              setState((prev) => ({
                ...prev,
                phase: "error",
                error: payload.payload?.code ?? "session_error",
              }));
            }
          } catch (err) {
            console.warn("rps_ws_message_parse_failed", err);
          }
        };

        socket.addEventListener("open", handleOpen);
        socket.addEventListener("close", handleClose);
        socket.addEventListener("message", handleMessage as EventListener);

        cleanupRef.current = () => {
          socket.removeEventListener("open", handleOpen);
          socket.removeEventListener("close", handleClose);
          socket.removeEventListener("message", handleMessage as EventListener);
        };
      } catch (error) {
        console.warn("rps_ws_open_failed", error);
        if (!cancelled) {
          setState((prev) => ({ ...prev, phase: "error", error: error instanceof Error ? error.message : "connection_failed" }));
        }
      }
    };

    void openStream();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      const socket = wsRef.current;
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      const currentSession = sessionIdRef.current;
      if (currentSession && joinedRef.current) {
        joinedRef.current = false;
        void leaveSession(currentSession, selfId).catch(() => undefined);
      }
    };
  }, [opts.sessionId]);

  const readyUp = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      await setSessionReady(sessionId, selfIdRef.current, true);
    } catch (error) {
      console.warn("rps_ready_failed", error);
      setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : "ready_failed" }));
    }
  }, []);

  useEffect(() => {
    resetOutcomeGuard(outcomeRecordedRef);
  }, [state.sessionId]);

  const unready = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      await setSessionReady(sessionId, selfIdRef.current, false);
    } catch (error) {
      console.warn("rps_unready_failed", error);
      setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : "ready_failed" }));
    }
  }, []);

  const submitMove = useCallback(
    async (move: RpsChoice) => {
      const socket = wsRef.current;
      const sessionId = sessionIdRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) {
        setState((prev) => ({ ...prev, error: "connection_closed" }));
        return;
      }
      try {
        socket.send(JSON.stringify({ type: "submit", payload: { userId: selfIdRef.current, move } }));
        setState((prev) => ({ ...prev, submittedMove: move }));
      } catch (error) {
        console.warn("rps_submit_move_failed", error);
        setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : "submit_failed" }));
      }
    },
    [],
  );

  const leave = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const selfId = selfIdRef.current;
    if (!sessionId || !selfId) return;

    // Send leave via WebSocket first for immediate feedback
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'leave',
        payload: { userId: selfId }
      }));
    }

    // Also call REST API as backup
    try {
      await leaveSession(sessionId, selfId);
    } catch {
      // Ignore errors, websocket should handle it
    }
  }, []);

  const restart = useCallback(() => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'restart' }));
    }
  }, []);

  // NOTE: Game outcome is recorded by the backend activities-core service via WebSocket
  // Do NOT record from frontend to avoid double-counting stats
  // The useEffect that called maybeRecordOutcome has been removed

  return useMemo(
    () => ({
      state,
      readyUp,
      unready,
      submitMove,
      leave,
      restart,
    }),
    [state, readyUp, unready, submitMove, leave, restart],
  );
}
