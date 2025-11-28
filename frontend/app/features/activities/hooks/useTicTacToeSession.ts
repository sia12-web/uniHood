import { useEffect, useRef, useState, useCallback } from "react";
import { getSelf } from "../api/client";

export interface TicTacToeState {
    board: (string | null)[];
    turn: 'X' | 'O';
    winner: string | null;
    players: { X?: string; O?: string };
    spectators: string[];
    myRole?: 'X' | 'O' | 'spectator';
    connected: boolean;
    error?: string;
}

const CORE_BASE = (process.env.NEXT_PUBLIC_ACTIVITIES_CORE_URL || "http://localhost:3001").replace(/\/$/, "");

export function useTicTacToeSession(sessionId: string) {
    const [state, setState] = useState<TicTacToeState>({
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        players: {},
        spectators: [],
        connected: false
    });

    const wsRef = useRef<WebSocket | null>(null);
    const selfRef = useRef<string>(getSelf());

    useEffect(() => {
        if (!sessionId) return;

        const isAbsolute = CORE_BASE.startsWith("http://") || CORE_BASE.startsWith("https://");
        let origin: string;
        if (isAbsolute) {
            origin = CORE_BASE.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
        } else {
            origin = `ws://localhost:3001`;
        }

        const url = `${origin}/activities/session/${sessionId}/stream`;
        console.log('Connecting to', url);

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to Tic-Tac-Toe session');
            setState(s => ({ ...s, connected: true }));
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

        ws.onclose = () => {
            console.log('Disconnected');
            setState(s => ({ ...s, connected: false }));
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

    return { state, makeMove, restartGame, self: selfRef.current };
}
