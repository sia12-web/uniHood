import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';
import { recordGameResult } from '../services/stats';

type Participant = { userId: string; joined: boolean; ready: boolean };
type ScoreEntry = { userId: string; score: number };

type TriviaQuestion = { question: string; options: string[]; correctIndex: number };

type TriviaSession = {
    id: string;
    activityKey: 'quick_trivia';
    participants: Participant[];
    scores: Record<string, number>;
    currentRound: number;
    status: 'pending' | 'running' | 'ended';
    lobbyReady: boolean;
    startedAt?: number;
    roundStartedAt?: number;
    leaveReason?: 'opponent_left' | 'forfeit' | null;
    createdAt: number;
    statsRecorded?: boolean;  // Guard against duplicate stat recording
};

const QUESTION_TIME_MS = 7_000;
const CORRECT_POINTS = 10;
const WRONG_POINTS = -5;
const ROUND_COUNT = 5;

const sockets: Record<string, Set<WebSocket>> = {};
const sessions: Record<string, TriviaSession> = {};
const roundTimers: Record<string, NodeJS.Timeout | null> = {};
const userSockets: Record<string, Map<string, WebSocket>> = {}; // sessionId -> userId -> socket

// Session cleanup configuration (prevents memory leaks)
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_ENDED_TTL_MS = 60 * 60 * 1000; // 1 hour after ending
const SESSION_PENDING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours if never started

/**
 * Cleanup stale sessions to prevent memory leaks.
 * Removes sessions that have ended >1hr ago or been pending >24hr.
 */
function cleanupStaleSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const sessionId of Object.keys(sessions)) {
        const session = sessions[sessionId];
        if (!session) continue;

        const age = now - session.createdAt;
        const shouldClean =
            (session.status === 'ended' && age > SESSION_ENDED_TTL_MS) ||
            (session.status === 'pending' && age > SESSION_PENDING_TTL_MS);

        if (shouldClean) {
            // Clean up all related state
            delete sessions[sessionId];
            delete sockets[sessionId];
            delete questionDeck[sessionId];
            delete roundAnswers[sessionId];
            delete userSockets[sessionId];
            if (roundTimers[sessionId]) {
                clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
                delete roundTimers[sessionId];
            }
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`[QuickTrivia] Cleaned up ${cleanedCount} stale sessions. Active: ${Object.keys(sessions).length}`);
    }
}

// Start cleanup interval (runs every 5 minutes)
setInterval(cleanupStaleSessions, SESSION_CLEANUP_INTERVAL_MS);


const questionBank: TriviaQuestion[] = [
    { question: 'Capital of France?', options: ['Paris', 'Berlin', 'Rome', 'Madrid'], correctIndex: 0 },
    { question: 'Result of 7 x 8?', options: ['54', '56', '64', '48'], correctIndex: 1 },
    { question: 'Largest planet?', options: ['Mars', 'Earth', 'Jupiter', 'Venus'], correctIndex: 2 },
    { question: 'Chemical symbol for water?', options: ['O2', 'H2O', 'CO2', 'NaCl'], correctIndex: 1 },
    { question: 'Fastest land animal?', options: ['Cheetah', 'Lion', 'Horse', 'Gazelle'], correctIndex: 0 },
    { question: 'Primary color not in RGB?', options: ['Red', 'Green', 'Blue', 'Yellow'], correctIndex: 3 },
];

/**
 * Pick `count` random questions using Fisher-Yates partial shuffle.
 * This is O(count) instead of O(N log N) for sorting the entire array.
 */
function pickQuestions(count: number): TriviaQuestion[] {
    const pool = [...questionBank];
    const result: TriviaQuestion[] = [];
    const n = Math.min(count, pool.length);

    for (let i = 0; i < n; i++) {
        const randomIndex = i + Math.floor(Math.random() * (pool.length - i));
        // Swap
        [pool[i], pool[randomIndex]] = [pool[randomIndex], pool[i]];
        result.push(pool[i]);
    }

    return result;
}

const questionDeck: Record<string, TriviaQuestion[]> = {};
const roundAnswers: Record<string, { answeredBy?: string; choiceIndex?: number; correct?: boolean }> = {};

export function createQuickTriviaSession(creatorUserId: string, participants?: string[]): string {
    const sessionId = `qt-${Math.random().toString(36).slice(2, 10)}`;
    const initialParticipants: Participant[] = [];
    const unique = Array.from(new Set([creatorUserId, ...(participants || [])]));
    for (const userId of unique) {
        // Creator is joined but NOT ready - all players must click Ready manually
        const isCreator = userId === creatorUserId;
        initialParticipants.push({
            userId,
            joined: isCreator,
            ready: false  // Everyone must manually ready up
        });
    }
    sessions[sessionId] = {
        id: sessionId,
        activityKey: 'quick_trivia',
        participants: initialParticipants,
        scores: {},
        currentRound: -1,
        status: 'pending',
        lobbyReady: false, // Will be set to true when enough players join and are ready
        createdAt: Date.now(),
    };
    questionDeck[sessionId] = pickQuestions(ROUND_COUNT);
    return sessionId;
}

export function getQuickTriviaSession(sessionId: string): TriviaSession | undefined {
    return sessions[sessionId];
}

export function listQuickTriviaSessions(): Array<{
    sessionId: string;
    activityKey: 'quick_trivia';
    status: 'pending' | 'running' | 'ended';
    phase: 'lobby' | 'countdown' | 'running' | 'ended';
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
    createdAt: number;
}> {
    return Object.values(sessions).map((s) => ({
        sessionId: s.id,
        activityKey: 'quick_trivia',
        status: s.status,
        phase: s.status === 'running' ? 'running' : s.status === 'ended' ? 'ended' : 'lobby',
        lobbyReady: s.lobbyReady,
        creatorUserId: s.participants[0]?.userId || 'anonymous',
        participants: s.participants,
        createdAt: s.createdAt,
    }));
}

export function joinQuickTrivia(sessionId: string, userId: string): TriviaSession {
    const session = sessions[sessionId];
    if (!session) {
        throw new Error('session_not_found');
    }
    const existing = session.participants.find((p) => p.userId === userId);
    if (existing) {
        existing.joined = true;
        // Don't auto-ready - user must click Ready button
    } else {
        // New participant - joined but not ready
        session.participants.push({ userId, joined: true, ready: false });
    }
    // Lobby is ready when at least 2 participants are ready
    session.lobbyReady = session.participants.filter((p) => p.ready).length >= 2;
    if (session.status === 'pending' && session.lobbyReady) {
        startTriviaCountdown(sessionId);
    }
    return session;
}

export function setQuickTriviaReady(sessionId: string, userId: string, ready: boolean): TriviaSession {
    const session = sessions[sessionId];
    if (!session) {
        throw new Error('session_not_found');
    }
    const participant = session.participants.find((p) => p.userId === userId);
    if (participant) {
        participant.ready = ready;
        participant.joined = true;
    }
    session.lobbyReady = session.participants.filter((p) => p.ready).length >= 2;
    if (session.status === 'pending' && session.lobbyReady) {
        startTriviaCountdown(sessionId);
    }
    broadcastPresence(sessionId);
    return session;
}

// Leave/forfeit handler
export function leaveQuickTrivia(sessionId: string, userId: string): { sessionEnded: boolean; winnerUserId?: string } {
    const session = sessions[sessionId];
    if (!session) throw new Error('session_not_found');

    // Remove user from socket tracking
    userSockets[sessionId]?.delete(userId);

    // Remove from participants
    const idx = session.participants.findIndex(p => p.userId === userId);
    if (idx !== -1) {
        session.participants.splice(idx, 1);
    }

    // If game was running, forfeit - remaining player wins
    if (session.status === 'running' || session.status === 'pending') {
        const remaining = session.participants.filter(p => p.joined);
        if (remaining.length === 1 && session.status === 'running') {
            // Award win to remaining player
            const winner = remaining[0];
            const winnerScore = session.scores[winner.userId] || 0;
            session.scores[winner.userId] = Math.max(winnerScore, 100); // Ensure minimum score
            session.status = 'ended';
            session.leaveReason = 'opponent_left';

            // Record stats using fixed points (only if not already recorded)
            if (!session.statsRecorded) {
                session.statsRecorded = true;
                (async () => {
                    try {
                        await recordGameResult(winner.userId, 'quick_trivia', 'win', 200);  // Fixed: 50 + 150
                        await recordGameResult(userId, 'quick_trivia', 'loss', 50);  // Fixed: 50
                    } catch (err) {
                        console.error('[QuickTrivia] Failed to record game stats (forfeit):', err);
                    }
                })();
            }

            // Clear round timer
            if (roundTimers[sessionId]) {
                clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
                roundTimers[sessionId] = null;
            }

            // Broadcast ended event
            const scores = Object.entries(session.scores).map(([id, score]) => ({ userId: id, score }));
            sendToSession(sessionId, {
                type: 'activity.session.ended',
                payload: {
                    sessionId,
                    winnerUserId: winner.userId,
                    finalScoreboard: { participants: scores },
                    reason: 'opponent_left'
                },
            });

            return { sessionEnded: true, winnerUserId: winner.userId };
        } else if (remaining.length === 0) {
            session.status = 'ended';
            session.leaveReason = 'opponent_left';
            if (roundTimers[sessionId]) {
                clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
                roundTimers[sessionId] = null;
            }
            return { sessionEnded: true };
        }
    }

    session.lobbyReady = session.participants.filter(p => p.ready).length >= 2;
    broadcastPresence(sessionId);
    return { sessionEnded: false };
}

// Handle disconnect
function handleDisconnect(sessionId: string, socket: WebSocket) {
    const userMap = userSockets[sessionId];
    if (!userMap) return;

    let disconnectedUserId: string | null = null;
    for (const [userId, sock] of userMap.entries()) {
        if (sock === socket) {
            disconnectedUserId = userId;
            break;
        }
    }

    if (disconnectedUserId) {
        console.log(`[QuickTrivia] User ${disconnectedUserId} disconnected from session ${sessionId}`);
        leaveQuickTrivia(sessionId, disconnectedUserId);
    }
}

export function handleQuickTriviaConnection(connection: SocketStream, _req: FastifyRequest, sessionId: string) {
    const socket = connection.socket as unknown as WebSocket;
    if (!sessions[sessionId]) {
        socket.close(1008, 'session_not_found');
        return;
    }
    if (!sockets[sessionId]) {
        sockets[sessionId] = new Set();
    }
    sockets[sessionId].add(socket);

    // Track connected user (will be set on join message)
    let connectedUserId: string | null = null;

    // initial snapshot
    sendSnapshot(sessionId, socket);

    socket.addEventListener('message', (evt) => {
        try {
            const msg = JSON.parse(evt.data.toString());
            // Track user from join message
            if (msg?.type === 'join' && msg.payload?.userId) {
                connectedUserId = msg.payload.userId;
                if (!userSockets[sessionId]) userSockets[sessionId] = new Map();
                userSockets[sessionId].set(connectedUserId!, socket);
            }
            if (msg?.type === 'submit') {
                const choice = msg.payload?.choiceIndex;
                const userId = msg.payload?.userId;
                if (typeof choice === 'number' && typeof userId === 'string') {
                    // Track userId from submit if not tracked yet
                    if (!connectedUserId) {
                        connectedUserId = userId;
                        if (!userSockets[sessionId]) userSockets[sessionId] = new Map();
                        userSockets[sessionId].set(connectedUserId!, socket);
                    }
                    handleAnswer(sessionId, userId, choice);
                }
            }
        } catch {
            /* ignore */
        }
    });

    socket.addEventListener('close', () => {
        sockets[sessionId]?.delete(socket);
        // Handle disconnect for forfeit logic
        if (connectedUserId) {
            handleDisconnect(sessionId, socket);
        }
    });
}

function sendToSession(sessionId: string, payload: unknown) {
    const msg = JSON.stringify(payload);
    sockets[sessionId]?.forEach((sock) => {
        try {
            sock.send(msg);
        } catch {
            /* ignore send errors */
        }
    });
}

function sendSnapshot(sessionId: string, target?: WebSocket) {
    const session = sessions[sessionId];
    if (!session) return;
    const snapshot = {
        type: 'session.snapshot',
        payload: {
            id: sessionId,
            status: session.status,
            activityKey: 'quick_trivia',
            presence: session.participants,
            lobbyReady: session.lobbyReady,
            currentRoundIndex: session.currentRound,
            scoreboard: {
                participants: Object.entries(session.scores).map(([userId, score]) => ({ userId, score })),
            },
        },
    };
    if (target) {
        try {
            target.send(JSON.stringify(snapshot));
        } catch {
            /* ignore */
        }
    } else {
        sendToSession(sessionId, snapshot);
    }
}

function broadcastPresence(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;
    sendToSession(sessionId, {
        type: 'activity.session.presence',
        payload: { sessionId, participants: session.participants, lobbyReady: session.lobbyReady },
    });
}

function broadcastCountdown(sessionId: string, durationMs: number, reason: 'lobby' | 'intermission' = 'lobby') {
    const startedAt = Date.now();
    sendToSession(sessionId, {
        type: 'activity.session.countdown',
        payload: { sessionId, startedAt, durationMs, endsAt: startedAt + durationMs, reason },
    });
}

function startTriviaCountdown(sessionId: string) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'pending') return;
    broadcastPresence(sessionId);
    broadcastCountdown(sessionId, 3_000, 'lobby');
    setTimeout(() => startSession(sessionId), 3_000);
}

function startSession(sessionId: string) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'pending') return;
    session.status = 'running';
    session.startedAt = Date.now();
    session.currentRound = 0;
    sendToSession(sessionId, { type: 'activity.session.started', payload: { sessionId, currentRound: 0 } });
    startRound(sessionId, 0);
}

function startRound(sessionId: string, roundIndex: number) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'running') return;
    const deck = questionDeck[sessionId] || pickQuestions(ROUND_COUNT);
    questionDeck[sessionId] = deck;
    const question = deck[roundIndex % deck.length];
    if (!question) {
        endSession(sessionId);
        return;
    }
    session.currentRound = roundIndex;
    session.roundStartedAt = Date.now();
    roundAnswers[sessionId] = {};
    const payload = {
        type: 'activity.round.started',
        payload: {
            sessionId,
            index: roundIndex,
            payload: { question: question.question, options: question.options, timeLimitMs: QUESTION_TIME_MS },
        },
    };
    sendToSession(sessionId, payload);
    if (roundTimers[sessionId]) {
        clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
    }
    roundTimers[sessionId] = setTimeout(() => {
        endRound(sessionId, question.correctIndex, false);
    }, QUESTION_TIME_MS);
}

function handleAnswer(sessionId: string, userId: string, choiceIndex: number) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'running') return;
    const deck = questionDeck[sessionId];
    const question = deck?.[session.currentRound];
    if (!question) return;
    const already = roundAnswers[sessionId]?.answeredBy;
    if (already) {
        return;
    }
    const correct = choiceIndex === question.correctIndex;
    roundAnswers[sessionId] = { answeredBy: userId, choiceIndex, correct };
    if (!session.scores[userId]) {
        session.scores[userId] = 0;
    }

    // Scoring: Base + Speed Bonus
    let points = WRONG_POINTS;
    if (correct) {
        const now = Date.now();
        const start = session.roundStartedAt || now;
        const elapsed = now - start;
        const remaining = Math.max(0, QUESTION_TIME_MS - elapsed);
        // Bonus: 1 point per 100ms remaining
        const speedBonus = Math.floor(remaining / 100);
        points = CORRECT_POINTS + speedBonus;
    }

    session.scores[userId] += points;
    if (roundTimers[sessionId]) {
        clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
        roundTimers[sessionId] = null;
    }
    endRound(sessionId, question.correctIndex, true);
}

function endRound(sessionId: string, correctIndex: number, hasAnswer: boolean) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'running') return;
    const scores: ScoreEntry[] = Object.entries(session.scores).map(([userId, score]) => ({ userId, score }));
    sendToSession(sessionId, {
        type: 'activity.round.ended',
        payload: { sessionId, index: session.currentRound, correctIndex, scoreboard: { participants: scores } },
    });
    const nextIndex = session.currentRound + 1;
    if (nextIndex >= ROUND_COUNT) {
        endSession(sessionId);
        return;
    }
    // short intermission before next question
    setTimeout(() => startRound(sessionId, nextIndex), hasAnswer ? 400 : 1000);
}

function endSession(sessionId: string) {
    const session = sessions[sessionId];
    if (!session || session.status === 'ended') return;
    session.status = 'ended';

    // Guard: Record stats only once per session
    const shouldRecordStats = !session.statsRecorded;
    if (shouldRecordStats) {
        session.statsRecorded = true;
    }

    // Build scores for ALL participants, not just those who answered
    const allParticipantIds = session.participants.map(p => p.userId);
    const scores: ScoreEntry[] = allParticipantIds.map(userId => ({
        userId,
        score: session.scores[userId] ?? 0
    }));

    const winner = scores.sort((a, b) => b.score - a.score)[0]?.userId;

    // Record stats for ALL participants using fixed leaderboard points (ONLY ONCE)
    // Winner: 200 (50 played + 150 win), Loser: 50 (played only)
    if (shouldRecordStats) {
        (async () => {
            try {
                for (const userId of allParticipantIds) {
                    const isWinner = userId === winner;
                    const result = isWinner ? 'win' : 'loss';
                    const fixedPoints = isWinner ? 200 : 50;
                    await recordGameResult(userId, 'quick_trivia', result, fixedPoints);
                }
            } catch (err) {
                console.error('[QuickTrivia] Failed to record game stats:', err);
            }
        })();
    }

    sendToSession(sessionId, {
        type: 'activity.session.ended',
        payload: { sessionId, winnerUserId: winner, finalScoreboard: { participants: scores } },
    });
    if (roundTimers[sessionId]) {
        clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
        roundTimers[sessionId] = null;
    }
}
