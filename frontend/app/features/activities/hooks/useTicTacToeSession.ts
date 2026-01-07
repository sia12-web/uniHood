import { useEffect, useRef, useState, useCallback } from "react";
import { getSelf, resolveActivitiesCoreUrl, leaveSession } from "../api/client";

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
