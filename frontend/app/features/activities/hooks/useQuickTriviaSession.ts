import { useEffect, useRef, useState, useCallback } from 'react';
import { getSelf } from '../api/client';

export interface TriviaState {
  phase: 'idle' | 'connecting' | 'lobby' | 'running' | 'ended';
  sessionId?: string;
  activityKey?: 'quick_trivia';
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
}

export function useQuickTriviaSession(opts: { sessionId?: string }) {
  const [state, setState] = useState<TriviaState>({ phase: 'idle', scoreboard: [] });
  const wsRef = useRef<WebSocket | null>(null);
  const roundStartMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!opts.sessionId) return;
    setState(s => ({ ...s, phase: 'connecting', sessionId: opts.sessionId }));
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/activities/session/${opts.sessionId}/stream`);
    wsRef.current = ws;
    ws.onopen = () => setState(s => ({ ...s, phase: 'lobby' }));
    ws.onmessage = evt => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'activity.round.started') {
          const payload = msg.payload?.payload || msg.payload; // backend shape fallback
          const index = msg.payload?.index ?? payload?.index;
          roundStartMsRef.current = Date.now();
          setState(s => ({
            ...s,
            phase: 'running',
            activityKey: 'quick_trivia',
            currentRound: index,
            timeLimitMs: payload?.timeLimitMs,
            question: payload?.question,
            options: payload?.options || [],
            selectedIndex: undefined,
            correctIndex: undefined,
            locked: false,
          }));
        }
        if (msg.type === 'activity.score.updated') {
          const { userId, total } = msg.payload;
          setState(s => ({ ...s, scoreboard: mergeScore(s.scoreboard, userId, total) }));
        }
        if (msg.type === 'activity.round.ended') {
          const correctIndex = msg.payload?.correctIndex;
          const roundBoard = msg.payload?.scoreboard?.participants;
          setState(s => ({
            ...s,
            correctIndex,
            locked: true,
            scoreboard: Array.isArray(roundBoard) && roundBoard.length > 0 ? mergeSnapshot(s.scoreboard, roundBoard) : s.scoreboard,
          }));
        }
        if (msg.type === 'activity.session.ended') {
          const finalBoard = msg.payload?.finalScoreboard?.participants;
          const winnerFromBoard = msg.payload?.finalScoreboard?.winnerUserId;
          const directWinner = msg.payload?.winnerUserId;
          const tieBreakWinnerUserId = msg.payload?.tieBreak?.winnerUserId || msg.payload?.tieBreakWinnerUserId;
          const resolvedWinner = tieBreakWinnerUserId || directWinner || winnerFromBoard;
          setState(s => ({
            ...s,
            phase: 'ended',
            winnerUserId: resolvedWinner,
            tieBreakWinnerUserId,
            scoreboard: Array.isArray(finalBoard) && finalBoard.length > 0 ? mergeSnapshot(s.scoreboard, finalBoard) : s.scoreboard,
          }));
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => setState(s => ({ ...s, phase: 'ended' }));
    ws.onclose = () => setState(s => ({ ...s, phase: 'ended' }));
    return () => { ws.close(); };
  }, [opts.sessionId]);

  const selectOption = useCallback((idx: number) => {
    setState(s => {
      if (s.locked || s.phase !== 'running' || s.selectedIndex !== undefined) return s;
      // send submission
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'submit', payload: { choiceIndex: idx, userId: getSelf(), tClientMs: Date.now() } }));
      }
      return { ...s, selectedIndex: idx, locked: true };
    });
  }, []);

  // Auto timeout -> no submission (choiceIndex omitted) just lock
  useEffect(() => {
    if (state.phase !== 'running' || !state.timeLimitMs || !roundStartMsRef.current) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - (roundStartMsRef.current || 0);
      if (elapsed >= (state.timeLimitMs || 0) && !state.locked) {
        setState(s => ({ ...s, locked: true }));
      }
    }, 250);
    return () => clearInterval(id);
  }, [state.phase, state.timeLimitMs, state.locked]);

  const remainingMs = state.phase === 'running' && state.timeLimitMs && roundStartMsRef.current
    ? Math.max(state.timeLimitMs - (Date.now() - roundStartMsRef.current), 0)
    : 0;
  const progress = state.timeLimitMs ? 1 - remainingMs / state.timeLimitMs : 0;

  return { state, selectOption, progress, self: getSelf() };
}

function mergeScore(list: Array<{ userId: string; score: number }>, userId: string, score: number) {
  const next = list.map(entry => (entry.userId === userId ? { ...entry, score } : entry));
  if (next.some(entry => entry.userId === userId)) {
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
