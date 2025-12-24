import { useEffect, useRef, useState, useCallback } from "react";
import { getSelf, resolveActivitiesCoreUrl, leaveSession } from "../api/client";

export interface StoryParagraph {
    userId: string;
    text: string;
    votes: Record<string, number>;
}

export interface StoryBuilderState {
    id: string;
    activityKey: 'story_builder';
    status: 'pending' | 'countdown' | 'writing' | 'voting' | 'ended';
    phase: 'lobby' | 'countdown' | 'writing' | 'voting' | 'ended';
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean; score: number; gender?: 'boy' | 'girl' }>;
    createdAt: number;
    roundStartedAt?: number;
    paragraphs: StoryParagraph[];
    maxParagraphsPerUser: number;
    currentTurnUserId?: string;
    turnOrder: string[];
    turnIndex: number;
    winnerUserId?: string | null;
    storyPrompt?: { title: string; opening: string };
    leaveReason?: 'opponent_left' | 'forfeit' | null;
    connected: boolean;
    error?: string;
    debugUrl?: string;
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

export function useStoryBuilderSession(sessionId: string) {
    const [state, setState] = useState<StoryBuilderState>({
        id: sessionId,
        activityKey: 'story_builder',
        status: 'pending',
        phase: 'lobby',
        lobbyReady: false,
        creatorUserId: '',
        participants: [],
        createdAt: 0,
        paragraphs: [],
        maxParagraphsPerUser: 3,
        turnOrder: [],
        turnIndex: 0,
        connected: false
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

        setState(s => ({ ...s, debugUrl: socketUrl }));
        const ws = new WebSocket(socketUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setState(s => ({ ...s, connected: true, error: undefined }));
            // Join the story session
            ws.send(JSON.stringify({
                type: 'join',
                payload: { userId: selfRef.current }
            }));
        };

        ws.onerror = () => {
            setState(s => ({ ...s, error: 'Connection failed' }));
        };

        ws.onclose = () => {
            setState(s => ({ ...s, connected: false }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'state') {
                    setState(s => ({ ...s, ...msg.payload }));
                } else if (msg.type === 'story:append') {
                    console.log('[StoryBuilder] Story appended:', msg.payload);
                }
            } catch (e) {
                console.error('Failed to parse message', e);
            }
        };

        return () => {
            ws.close();
        };
    }, [sessionId]);

    const toggleReady = (gender?: 'boy' | 'girl') => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'ready',
            payload: { userId: selfRef.current, gender }
        }));
    };

    const submitParagraph = (text: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'submit_paragraph',
            payload: { userId: selfRef.current, text }
        }));
    };

    const voteParagraph = (paragraphIndex: number, score: number) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'vote_paragraph',
            payload: { userId: selfRef.current, paragraphIndex, score }
        }));
    };

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


    return {
        state,
        toggleReady,
        submitParagraph,
        voteParagraph,
        leave,
        selfId: selfRef.current
    };
}
