import { useEffect, useRef, useState, useCallback } from "react";
import { getSelf, resolveActivitiesCoreUrl, leaveSession } from "../api/client";
import { recordGameOutcome } from "@/lib/leaderboards";

export interface TicTacToeState {
    board: (string | null)[];
    turn: 'X' | 'O';
    winner: string | null;
    players: { X?: string; O?: string };
    spectators: string[];
    myRole?: 'X' | 'O' | 'spectator';
    connected: boolean;
    error?: string;
    status: 'lobby' | 'ready' | 'countdown' | 'playing' | 'finished';
    ready: Record<string, boolean>;
    scores: Record<string, number>;
    roundWins?: Record<string, number>;
    countdown: number | null;
    roundIndex?: number;
    lastRoundWinner?: string | null;
    matchWinner?: string | null;
    leaveReason?: string;
}

function resolveSocketUrl(sessionId: string): string | null {
    if (!sessionId) {
        return null;
    }
    const path = `/activities/session/${sessionId}/stream`;
    let target = resolveActivitiesCoreUrl(path);
    if (!target) {
        return null;
    }
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
        if (typeof window === "undefined") {
            return null;
        }
        const origin = window.location.origin;
        const prefix = target.startsWith("/") ? "" : "/";
        target = `${origin}${prefix}${target}`;
    }
    if (target.startsWith("https://")) {
        return `wss://${target.slice("https://".length)}`;
    }
    if (target.startsWith("http://")) {
        return `ws://${target.slice("http://".length)}`;
    }
    return null;
}

export function useTicTacToeSession(sessionId: string) {
    const [state, setState] = useState<TicTacToeState>({
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        players: {},
        spectators: [],
        connected: false,
        status: 'lobby',
        ready: {},
        scores: {},
        countdown: null
    });

    const wsRef = useRef<WebSocket | null>(null);
    const selfRef = useRef<string>(getSelf());
    const lastRecordedKeyRef = useRef<string | null>(null);
    const gameStartedAtRef = useRef<number | null>(null);
    const maxMoveCountRef = useRef<number>(0);

    useEffect(() => {
        if (!sessionId) return;
        const socketUrl = resolveSocketUrl(sessionId);
        if (!socketUrl) {
            setState((s) => ({ ...s, error: "unresolved_socket" }));
            return;
        }
        const ws = new WebSocket(socketUrl);
        wsRef.current = ws;
        setState((s) => ({ ...s, error: undefined }));

        ws.onopen = () => {
            setState((s) => ({ ...s, connected: true }));
            // Join as random role or spectator?
            // For now, just join. The server will assign based on availability.
            // We need to send a join message.
            ws.send(JSON.stringify({
                type: 'join',
                payload: { userId: selfRef.current, role: 'X' } // Try to join as X first, server logic handles assignment
            }));
            // Also try O if X is taken? The server logic I wrote assigns X if empty, else O if empty.
            // So sending 'X' as preference is fine, or we can send no preference.
            // Let's send 'X' for now.
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'state') {
                    const payload = msg.payload;
                    const myRole = payload.players.X === selfRef.current ? 'X' :
                        payload.players.O === selfRef.current ? 'O' : 'spectator';
                    setState(s => ({ ...s, ...payload, myRole }));
                }
            } catch (e) {
                console.error('Failed to parse message', e);
            }
        };

        ws.onerror = () => {
            setState((s) => ({ ...s, connected: false, error: "connection_error" }));
        };

        ws.onclose = () => {
            setState((s) => ({ ...s, connected: false }));
        };

        return () => {
            ws.close();
        };
    }, [sessionId]);

    // Track gameplay timing & move count across state updates.
    useEffect(() => {
        if (state.status === 'playing') {
            if (gameStartedAtRef.current == null) {
                gameStartedAtRef.current = Date.now();
                maxMoveCountRef.current = 0;
            }
            const movesNow = state.board.filter((cell) => cell !== null).length;
            if (movesNow > maxMoveCountRef.current) {
                maxMoveCountRef.current = movesNow;
            }
        }

        // Reset trackers when leaving a game.
        if (state.status !== 'playing' && state.status !== 'finished') {
            gameStartedAtRef.current = null;
            maxMoveCountRef.current = 0;
            // Allow recording again for the next finished match.
            lastRecordedKeyRef.current = null;
        }
    }, [state.status, state.board]);

    // Record game outcome when finished
    useEffect(() => {
        if (state.status !== 'finished') {
            return;
        }

        // Get player IDs
        const players = state.players;
        const userIds = [players.X, players.O].filter((id): id is string => !!id);
        if (userIds.length < 2) {
            return;
        }

        // Only participants can record outcomes (backend enforces this).
        if (!userIds.includes(selfRef.current)) {
            return;
        }

        const winnerId = state.matchWinner ?? state.winner ?? null;
        const recordKey = `${sessionId}:${state.roundIndex ?? 'match'}:${winnerId ?? 'draw'}`;
        if (lastRecordedKeyRef.current === recordKey) {
            return;
        }
        lastRecordedKeyRef.current = recordKey;

        // Use the max move count seen while playing. The server may reset the board by the time
        // the finished state arrives, which would otherwise send move_count=0 and get blocked.
        const moveCount = Math.max(maxMoveCountRef.current, state.board.filter((cell) => cell !== null).length);

        // Compute a reasonable duration. If we never observed the playing state, fall back.
        const startedAt = gameStartedAtRef.current;
        const durationSeconds = startedAt != null ? Math.max(1, Math.floor((Date.now() - startedAt) / 1000)) : 60;

        // Record the outcome
        recordGameOutcome({
            userIds,
            winnerId,
            gameKind: 'tictactoe',
            durationSeconds,
            moveCount,
        }).catch((err) => {
            console.error('Failed to record game outcome:', err);
        });
    }, [state.status, state.players, state.matchWinner, state.winner, state.board]);

    const makeMove = useCallback((index: number) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'move',
                payload: { index, userId: selfRef.current }
            }));
        }
    }, []);

    const restartGame = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'restart' }));
        }
    }, []);

    const toggleReady = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'ready',
                payload: { userId: selfRef.current }
            }));
        }
    }, []);

    const leave = useCallback(async () => {
        const selfId = selfRef.current;
        if (!sessionId || !selfId) return;

        // Send leave via WebSocket first for immediate feedback
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
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
    }, [sessionId]);

    return { state, makeMove, restartGame, toggleReady, leave, self: selfRef.current };
}
