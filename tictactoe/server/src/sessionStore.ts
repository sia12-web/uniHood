import { GameSession } from './types';
import { v4 as uuidv4 } from 'uuid';
import { getInitialBoard } from './gameLogic';

// Simple in-memory store
const sessions: Record<string, GameSession> = {};
const codeToId: Record<string, string> = {};

export function createSession(): GameSession {
    const id = uuidv4();
    // Generate a short 6-character code
    let code = Math.random().toString(36).substring(2, 8).toUpperCase();
    while (codeToId[code]) {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    const session: GameSession = {
        id,
        code,
        players: [],
        spectators: [],
        board: getInitialBoard(),
        turn: 'X',
        status: 'waiting',
        winner: null,
        winningLine: null,
        createdAt: Date.now()
    };

    sessions[id] = session;
    codeToId[code] = id;
    return session;
}

export function getSession(id: string): GameSession | undefined {
    return sessions[id];
}

export function getSessionByCode(code: string): GameSession | undefined {
    const id = codeToId[code];
    return id ? sessions[id] : undefined;
}

export function removeSession(id: string): void {
    const session = sessions[id];
    if (session) {
        delete codeToId[session.code];
        delete sessions[id];
    }
}
