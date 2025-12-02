import { useEffect, useRef, useState } from "react";
import { getSelf, resolveActivitiesCoreUrl } from "../api/client";

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
    participants: Array<{ userId: string; joined: boolean; ready: boolean; score: number }>;
    createdAt: number;
    roundStartedAt?: number;
    paragraphs: StoryParagraph[];
    maxParagraphsPerUser: number;
    currentTurnUserId?: string;
    turnOrder: string[];
    turnIndex: number;
    winnerUserId?: string | null;
    connected: boolean;
    error?: string;
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
        const ws = new WebSocket(socketUrl);
        wsRef.current = ws;
        setState((s) => ({ ...s, error: undefined }));

        ws.onopen = () => {
            setState((s) => ({ ...s, connected: true }));
            ws.send(JSON.stringify({
                type: 'join',
                payload: { userId: selfRef.current }
            }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'state') {
                    setState(s => ({ ...s, ...msg.payload }));
                }
            } catch (e) {
                console.error('Failed to parse message', e);
            }
        };

        ws.onclose = () => {
            setState((s) => ({ ...s, connected: false }));
        };

        return () => {
            ws.close();
        };
    }, [sessionId]);

    const toggleReady = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'ready',
            payload: { userId: selfRef.current }
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

    return {
        state,
        toggleReady,
        submitParagraph,
        voteParagraph,
        selfId: selfRef.current
    };
}
