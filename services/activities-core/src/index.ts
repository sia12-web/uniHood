import 'dotenv/config';
console.log('DEBUG: POSTGRES_URL is', process.env.POSTGRES_URL ? 'SET' : 'UNSET');
import fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { handleTicTacToeConnection, createTicTacToeSession, getSession, joinSession, leaveSession, setReady, startSession, listSessions as listTicTacToeSessions } from './ws/tictactoe';
import { handleQuickTriviaConnection, createQuickTriviaSession, listQuickTriviaSessions, getQuickTriviaSession, joinQuickTrivia, setQuickTriviaReady, leaveQuickTrivia } from './ws/quickTrivia';
import { handleStoryBuilderConnection, createStoryBuilderSession, listStoryBuilderSessions, getStoryBuilderSession, joinStoryBuilder, setStoryBuilderReady, leaveStoryBuilder } from './ws/storyBuilder';
import { connectDb } from './lib/db';
import { recordGameResult } from './services/stats';

const server = fastify({ logger: true });

// Render's default health check hits GET /. Provide a simple 200 response.
server.get('/', async () => {
    return { status: 'ok' };
});

// Be explicit about which headers the browser can send so preflight requests succeed.
const allowedHeaders = [
    'Content-Type',
    'content-type',
    'Authorization',
    'authorization',
    'X-Requested-With',
    'x-requested-with',
    'X-User-Id',
    'x-user-id',
    'X-User-Handle',
    'x-user-handle',
    'X-User-Name',
    'x-user-name',
    'X-User-Roles',
    'x-user-roles',
    'X-Campus-Id',
    'x-campus-id',
    'X-Session-Id',
    'x-session-id',
    'X-Request-Id',
    'x-request-id',
    'X-Trace-Id',
    'x-trace-id',
    'X-Span-Id',
    'x-span-id',
    'X-Parent-Span-Id',
    'x-parent-span-id',
    'Accept',
    'accept',
    'traceparent',
    'tracestate',
    'X-RUM-Sample-Rate',
    'x-rum-sample-rate',
];

server.register(cors, {
    origin: true, // Reflect the request origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders,
    exposedHeaders: allowedHeaders,
    credentials: true,
});

server.register(websocket);

type GenericSession = {
    id: string;
    activityKey: 'speed_typing' | 'quick_trivia' | 'rock_paper_scissors' | 'story_builder';
    status: 'pending' | 'countdown' | 'running' | 'ended';
    phase: 'lobby' | 'countdown' | 'running' | 'round_result' | 'ended';
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
    createdAt: number;
    roundStartedAt?: number;
    scores: Record<string, number>;
    winnerUserId?: string | null;
    moves?: Record<string, string>;
    leaveReason?: 'opponent_left' | 'forfeit' | null;
    // RPS best-of-3 fields
    roundWins?: Record<string, number>;
    currentRound?: number;
    lastRoundWinner?: string | null;
    lastRoundMoves?: Record<string, string>;
    countdownValue?: number;
    statsRecorded?: boolean;  // Guard against duplicate stat recording
};

const genericSessions: Record<string, GenericSession> = {};
const genericSockets: Record<string, Set<WebSocket>> = {};
const genericUserSockets: Record<string, Map<string, WebSocket>> = {}; // sessionId -> userId -> socket
const genericCountdowns: Record<string, NodeJS.Timeout> = {}; // Server-side countdown timers

// Rate limiting: track pending sessions per user
const userPendingSessions: Record<string, Set<string>> = {}; // userId -> Set of sessionIds
const MAX_PENDING_SESSIONS_PER_USER = 3; // Max concurrent pending sessions per user
const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes for pending sessions
const SESSION_ENDED_TTL_MS = 60 * 60 * 1000; // 1 hour for ended sessions

// Session cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

function cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    // Cleanup generic sessions (RPS, Speed Typing)
    for (const [sessionId, session] of Object.entries(genericSessions)) {
        const age = now - session.createdAt;
        const shouldClean =
            (session.status === 'pending' && age > SESSION_EXPIRY_MS) ||
            (session.status === 'ended' && age > SESSION_ENDED_TTL_MS);

        if (shouldClean) {
            // Clear countdown timer if exists
            if (genericCountdowns[sessionId]) {
                clearInterval(genericCountdowns[sessionId]);
                delete genericCountdowns[sessionId];
            }
            delete genericSessions[sessionId];
            delete genericSockets[sessionId];
            delete genericUserSockets[sessionId];

            // Remove from user tracking
            for (const userId of Object.keys(userPendingSessions)) {
                userPendingSessions[userId]?.delete(sessionId);
            }
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`[Generic] Cleaned up ${cleanedCount} stale sessions. Active: ${Object.keys(genericSessions).length}`);
    }
}

function trackUserSession(userId: string, sessionId: string) {
    if (!userPendingSessions[userId]) {
        userPendingSessions[userId] = new Set();
    }
    userPendingSessions[userId].add(sessionId);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function untrackUserSession(userId: string, sessionId: string) {
    userPendingSessions[userId]?.delete(sessionId);
}

function getUserPendingSessionCount(userId: string): number {
    // Clean up ended sessions from tracking first
    const tracked = userPendingSessions[userId];
    if (!tracked) return 0;

    // Remove sessions that no longer exist or are not pending
    for (const sessionId of tracked) {
        const session = genericSessions[sessionId];
        if (!session || session.status !== 'pending') {
            tracked.delete(sessionId);
        }
    }

    return tracked.size;
}

const GENERIC_COUNTDOWN_MS = 3000;
const GENERIC_ROUND_DURATION_MS = 30000;
const RPS_MAX_ROUNDS = 5; // Best of 5 - play all 5 rounds or until someone gets 3 wins
const RPS_ROUND_WIN_TARGET = 3; // First to 3 wins
const GENERIC_SAMPLES: string[] = [
    "Why don’t skeletons fight? They don’t have the guts.",
    "Parallel lines have so much in common. It’s a shame they’ll never meet.",
    "I told my computer I needed a break, and it said 'No problem—I'll go to sleep.'",
    "I’m reading a book about anti-gravity. It’s impossible to put down.",
    "Debugging: being the detective in a crime movie where you are also the murderer.",
    "Why did the scarecrow win an award? He was outstanding in his field.",
    "I only know 25 letters of the alphabet. I don’t know y.",
    "What do you call fake spaghetti? An impasta.",
    "Helvetica and Times New Roman walk into a bar. 'Get out!' shouts the bartender. 'We don't serve your type.'",
    "Why was the math book sad? It had too many problems.",
    "I told a joke about UDP, but I’m not sure if anyone got it.",
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "I used to play piano by ear, but now I use my hands.",
    "I asked the lion in my wardrobe what he was doing. He said 'Narnia business.'",
    "Why don’t eggs tell jokes? They’d crack each other up.",
    "How do you organize a space party? You planet.",
    "Why did the developer go broke? He used up all his cache.",
    "Two antennas met on a roof, fell in love, and got married. The ceremony wasn’t much, but the reception was excellent.",
    "Why can’t you trust stairs? They’re always up to something.",
    "My dog ate my computer homework, so it was a byte-sized snack.",
];
const GENERIC_SAMPLE_TEXT = () => GENERIC_SAMPLES[Math.floor(Math.random() * GENERIC_SAMPLES.length)];

function snapshotFromGeneric(session: GenericSession) {
    // Use roundWins as the score for display (this is the "best of 5" round wins counter)
    const roundWins = session.roundWins ?? {};
    return {
        id: session.id,
        status: session.status,
        activityKey: session.activityKey,
        participants: session.participants.map((p) => ({ userId: p.userId, score: roundWins[p.userId] ?? 0 })),
        presence: session.participants.map((p) => ({ userId: p.userId, joined: p.joined, ready: p.ready })),
        lobbyReady: session.lobbyReady,
        countdown: session.countdownValue ?? null,
        currentRoundIndex: session.currentRound ?? 0,
        roundWins: roundWins,
        scoreboard: { participants: Object.entries(session.scores).map(([userId, score]) => ({ userId, score })) },
        winnerUserId: session.winnerUserId ?? null,
    };
}

// Server-side countdown timer for RPS (broadcasts state every second like TicTacToe)
function startGenericCountdown(sessionId: string, onComplete: () => void) {
    const session = genericSessions[sessionId];
    if (!session) return;

    session.status = 'countdown';
    session.phase = 'countdown';
    session.countdownValue = 5; // Start at 5 seconds

    // Clear any existing countdown
    if (genericCountdowns[sessionId]) {
        clearInterval(genericCountdowns[sessionId]);
    }

    // Broadcast initial state
    broadcastGenericState(sessionId);

    genericCountdowns[sessionId] = setInterval(() => {
        const s = genericSessions[sessionId];
        if (!s || s.status === 'ended') {
            clearInterval(genericCountdowns[sessionId]);
            return;
        }

        if (s.countdownValue && s.countdownValue > 0) {
            s.countdownValue--;
            broadcastGenericState(sessionId);
        } else {
            clearInterval(genericCountdowns[sessionId]);
            delete genericCountdowns[sessionId];
            onComplete();
        }
    }, 1000);
}

// Broadcast full state to all connected clients
function broadcastGenericState(sessionId: string) {
    const session = genericSessions[sessionId];
    const sockets = genericSockets[sessionId];
    if (!session || !sockets) return;

    const payload = {
        type: 'session.snapshot',
        payload: snapshotFromGeneric(session),
    };
    const message = JSON.stringify(payload);
    sockets.forEach((socket) => {
        try {
            socket.send(message);
        } catch {
            /* ignore */
        }
    });
}

// Broadcast round ended for RPS
function broadcastRpsRoundEnded(sessionId: string, roundWinnerId: string | null, moves: Record<string, string>, reason?: string) {
    const session = genericSessions[sessionId];
    const sockets = genericSockets[sessionId];
    if (!session || !sockets) return;

    const payload = {
        type: 'activity.round.ended',
        payload: {
            sessionId,
            round: session.currentRound,
            winnerUserId: roundWinnerId,
            moves: Object.entries(moves).map(([userId, move]) => ({ userId, move })),
            reason: reason,
            scoreboard: { participants: Object.entries(session.roundWins || {}).map(([userId, wins]) => ({ userId, score: wins })) },
        },
    };
    const message = JSON.stringify(payload);
    sockets.forEach((socket) => {
        try {
            socket.send(message);
        } catch {
            /* ignore */
        }
    });
}

function broadcastGenericPresence(sessionId: string) {
    const sockets = genericSockets[sessionId];
    const session = genericSessions[sessionId];
    if (!sockets || !session) return;
    const snapshot = snapshotFromGeneric(session);
    const snapshotMsg = JSON.stringify({ type: 'session.snapshot', payload: snapshot });
    const payload = {
        type: 'activity.session.presence',
        payload: {
            sessionId,
            participants: session.participants,
            lobbyReady: session.lobbyReady,
            phase: session.phase,
        },
    };
    const message = JSON.stringify(payload);
    sockets.forEach((socket) => {
        try {
            socket.send(snapshotMsg);
            socket.send(message);
        } catch {
            /* ignore */
        }
    });
}

function broadcastGenericStarted(sessionId: string) {
    const sockets = genericSockets[sessionId];
    if (!sockets) return;
    const payload = JSON.stringify({ type: 'activity.session.started', payload: { sessionId } });
    sockets.forEach((socket) => {
        try {
            socket.send(payload);
        } catch {
            /* ignore */
        }
    });
}

async function broadcastGenericEnded(sessionId: string) {
    const session = genericSessions[sessionId];
    if (!session) return;

    // Guard: Record stats only once per session
    const shouldRecordStats = !session.statsRecorded;
    if (shouldRecordStats) {
        session.statsRecorded = true;
    }

    // Build scores for ALL participants, not just those who submitted
    const allParticipantIds = session.participants.map(p => p.userId);
    const scores = allParticipantIds.map(userId => ({
        userId,
        score: session.scores[userId] ?? 0
    }));

    const winner = session.winnerUserId || (scores.sort((a, b) => b.score - a.score)[0]?.userId ?? null);

    // Record stats ONLY ONCE per session - for ALL participants
    // Use fixed scoring: 50 for playing, 150 bonus for winning = 200 total for winner, 50 for loser
    if (shouldRecordStats) {
        await Promise.all(allParticipantIds.map(async (userId) => {
            const isWinner = userId === winner;
            const result = isWinner ? 'win' : 'loss';
            // Fixed points: winner gets 200 (50 played + 150 win), loser gets 50 (played only)
            const fixedPoints = isWinner ? 200 : 50;
            await recordGameResult(userId, session.activityKey, result, fixedPoints);
        }));
    }

    const payload = {
        type: 'activity.session.ended',
        payload: {
            sessionId,
            winnerUserId: winner,
            finalScoreboard: { participants: scores },
            reason: session.leaveReason || undefined,
        },
    };
    const message = JSON.stringify(payload);
    genericSockets[sessionId]?.forEach((socket) => {
        try {
            socket.send(message);
        } catch {
            /* ignore */
        }
    });
}

function broadcastGenericCountdown(sessionId: string, durationMs: number) {
    const startedAt = Date.now();
    const payload = {
        type: 'activity.session.countdown',
        payload: { sessionId, startedAt, durationMs, endsAt: startedAt + durationMs },
    };
    const message = JSON.stringify(payload);
    genericSockets[sessionId]?.forEach((socket) => {
        try {
            socket.send(message);
        } catch {
            /* ignore */
        }
    });
}

function broadcastGenericRoundStarted(sessionId: string, index = 0) {
    const payload = {
        type: 'activity.round.started',
        payload: {
            sessionId,
            index,
            payload: { textSample: GENERIC_SAMPLE_TEXT(), timeLimitMs: GENERIC_ROUND_DURATION_MS },
        },
    };
    const message = JSON.stringify(payload);
    genericSockets[sessionId]?.forEach((socket) => {
        try {
            socket.send(message);
        } catch {
            /* ignore */
        }
    });
}

server.register(async function (fastify) {
    fastify.get('/activities/session/:sessionId/stream', { websocket: true }, (connection, req) => {
        const { sessionId } = req.params as { sessionId: string };
        if (sessionId.startsWith('ttt-') || getSession(sessionId)) {
            handleTicTacToeConnection(connection, req, sessionId);
            return;
        }
        if (sessionId.startsWith('qt-') || getQuickTriviaSession(sessionId)) {
            handleQuickTriviaConnection(connection, req, sessionId);
            return;
        }
        if (sessionId.startsWith('sb-') || getStoryBuilderSession(sessionId)) {
            handleStoryBuilderConnection(connection, req, sessionId);
            return;
        }
        const session = genericSessions[sessionId];
        const socket = connection.socket as unknown as WebSocket;
        if (!session) {
            socket.close(1008, 'session_not_found');
            return;
        }
        if (!genericSockets[sessionId]) {
            genericSockets[sessionId] = new Set();
        }
        genericSockets[sessionId].add(socket);

        // Send initial snapshot to move clients out of "connecting"
        try {
            socket.send(JSON.stringify({ type: 'session.snapshot', payload: snapshotFromGeneric(session) }));
        } catch {
            /* ignore */
        }

        socket.addEventListener('message', (evt) => {
            try {
                const msg = JSON.parse(evt.data.toString());

                // Handle join to track user-socket mapping
                if (msg?.type === 'join') {
                    const userId = msg.payload?.userId;
                    if (typeof userId === 'string') {
                        if (!genericUserSockets[sessionId]) genericUserSockets[sessionId] = new Map();
                        genericUserSockets[sessionId].set(userId, socket);
                    }
                }

                // Handle leave message
                if (msg?.type === 'leave') {
                    const userId = msg.payload?.userId;
                    if (typeof userId === 'string') {
                        genericUserSockets[sessionId]?.delete(userId);
                        session.participants = session.participants.filter((p) => p.userId !== userId);
                        session.lobbyReady = session.participants.every((p) => p.ready);

                        if (session.participants.length === 1 && (session.status === 'running' || session.status === 'countdown')) {
                            session.winnerUserId = session.participants[0].userId;
                            session.status = 'ended';
                            session.phase = 'ended';
                            session.leaveReason = 'opponent_left';
                            session.scores[session.winnerUserId] = (session.scores[session.winnerUserId] || 0) + 100;
                            broadcastGenericEnded(sessionId);
                        } else if (session.participants.length === 0) {
                            session.status = 'ended';
                            session.phase = 'ended';
                            session.leaveReason = 'opponent_left';
                        } else {
                            broadcastGenericPresence(sessionId);
                        }
                    }
                }

                if (msg?.type === 'submit') {
                    const userId = msg.payload?.userId;
                    if (typeof userId === 'string') {
                        if (session.activityKey === 'rock_paper_scissors') {
                            const move = msg.payload?.move;
                            if (move && ['rock', 'paper', 'scissors'].includes(move)) {
                                if (!session.moves) session.moves = {};
                                session.moves[userId] = move;

                                const activeParticipants = session.participants.filter(p => p.joined);
                                const allMoved = activeParticipants.every(p => session.moves![p.userId]);

                                if (allMoved && activeParticipants.length >= 2) {
                                    const moves = { ...session.moves };

                                    // Initialize round tracking if not present
                                    if (!session.roundWins) session.roundWins = {};
                                    if (session.currentRound === undefined) session.currentRound = 0;

                                    // Determine round winner (for 2 players)
                                    const p1 = activeParticipants[0].userId;
                                    const p2 = activeParticipants[1].userId;
                                    const m1 = moves[p1];
                                    const m2 = moves[p2];

                                    let roundWinnerId: string | null = null;
                                    let roundReason: string | undefined;

                                    console.log(`[RPS] Move check: p1=${p1.slice(0, 8)} has ${m1}, p2=${p2.slice(0, 8)} has ${m2}`);

                                    if (m1 === m2) {
                                        roundReason = 'draw';
                                        console.log(`[RPS] Result: DRAW`);
                                    } else if (
                                        (m1 === 'rock' && m2 === 'scissors') ||
                                        (m1 === 'scissors' && m2 === 'paper') ||
                                        (m1 === 'paper' && m2 === 'rock')
                                    ) {
                                        roundWinnerId = p1;
                                        session.roundWins[p1] = (session.roundWins[p1] || 0) + 1;
                                        console.log(`[RPS] Result: p1 (${p1.slice(0, 8)}) wins`);
                                    } else {
                                        roundWinnerId = p2;
                                        session.roundWins[p2] = (session.roundWins[p2] || 0) + 1;
                                        console.log(`[RPS] Result: p2 (${p2.slice(0, 8)}) wins`);
                                    }

                                    session.lastRoundWinner = roundWinnerId;
                                    session.lastRoundMoves = moves;

                                    // Check if match is over (best of 5)
                                    const wins1 = session.roundWins[p1] || 0;
                                    const wins2 = session.roundWins[p2] || 0;
                                    // currentRound is 0-based, so after round 1 (index 0), it's still 0
                                    // We need to check how many rounds have been COMPLETED
                                    const roundsPlayed = (session.currentRound ?? 0) + 1; // +1 because we're completing this round

                                    console.log(`[RPS] Round ${roundsPlayed} complete. Wins: ${p1}=${wins1}, ${p2}=${wins2}`);

                                    // Match ends if: someone reaches 3 wins OR all 5 rounds are played
                                    const matchOver = wins1 >= RPS_ROUND_WIN_TARGET || wins2 >= RPS_ROUND_WIN_TARGET || roundsPlayed >= RPS_MAX_ROUNDS;
                                    console.log(`[RPS] matchOver=${matchOver}, wins1=${wins1}, wins2=${wins2}, roundsPlayed=${roundsPlayed}, target=${RPS_ROUND_WIN_TARGET}, maxRounds=${RPS_MAX_ROUNDS}`);

                                    // Broadcast round ended
                                    broadcastRpsRoundEnded(sessionId, roundWinnerId, moves, roundReason);

                                    if (matchOver) {
                                        // Calculate final scores for best of 5
                                        const calculatePoints = (winnerWins: number, loserWins: number) => {
                                            if (winnerWins === 3 && loserWins === 0) return 300; // 3-0 sweep
                                            if (winnerWins === 3 && loserWins === 1) return 250; // 3-1
                                            if (winnerWins === 3 && loserWins === 2) return 200; // 3-2 close match
                                            if (winnerWins === 2 && loserWins === 2) return 150; // 2-2 draw after 5 rounds
                                            return 100; // fallback
                                        };

                                        // Determine winner (if someone has 3 wins, otherwise most wins after 5 rounds)
                                        // LOSER GETS 0 POINTS - only the winner gets points
                                        if (wins1 > wins2) {
                                            session.winnerUserId = p1;
                                            session.scores[p1] = calculatePoints(wins1, wins2);
                                            session.scores[p2] = 0; // Loser gets 0 points
                                        } else if (wins2 > wins1) {
                                            session.winnerUserId = p2;
                                            session.scores[p2] = calculatePoints(wins2, wins1);
                                            session.scores[p1] = 0; // Loser gets 0 points
                                        } else {
                                            // It's a draw - both get equal points
                                            session.winnerUserId = null;
                                            session.scores[p1] = 150;
                                            session.scores[p2] = 150;
                                        }

                                        session.status = 'ended';
                                        session.phase = 'ended';
                                        broadcastGenericEnded(sessionId);
                                    } else {
                                        // Start next round after a delay to show round result
                                        session.currentRound++;
                                        session.moves = {}; // Clear moves for next round

                                        // Set phase to 'round_result' so frontend knows we're between rounds
                                        session.phase = 'round_result';

                                        // 3 second delay between rounds to allow frontend to show result
                                        // Then go directly to running (no countdown between rounds)
                                        console.log(`[RPS] Round ended for session ${sessionId}, next round ${session.currentRound} starting in 3s`);
                                        setTimeout(() => {
                                            const s = genericSessions[sessionId];
                                            if (!s || s.status === 'ended') return;
                                            console.log(`[RPS] Starting round ${s.currentRound} for session ${sessionId}`);

                                            // Go directly to running state - no countdown between rounds
                                            s.status = 'running';
                                            s.phase = 'running';
                                            s.countdownValue = undefined;
                                            broadcastGenericState(sessionId);
                                            broadcastGenericRoundStarted(sessionId, s.currentRound ?? 0);
                                        }, 5000); // 5 second delay between rounds
                                    }
                                }
                            }
                        } else {
                            if (!session.scores[userId]) {
                                session.scores[userId] = 0;
                            }
                            // First submit wins in this stub
                            if (!session.winnerUserId) {
                                session.winnerUserId = userId;
                                session.status = 'ended';
                                session.phase = 'ended';

                                // Calculate Score: WPM + 50 Bonus
                                const now = Date.now();
                                const startTime = session.roundStartedAt || session.createdAt;
                                const durationMinutes = Math.max((now - startTime) / 60000, 0.01); // Avoid div by zero
                                const textSample = GENERIC_SAMPLE_TEXT();
                                const charCount = textSample.length;
                                const wpm = Math.round((charCount / 5) / durationMinutes);
                                const points = wpm + 50;

                                session.scores[userId] = points;
                                broadcastGenericEnded(sessionId);
                            }
                        }
                    }
                }

                // Handle restart message for RPS (start new match)
                if (msg?.type === 'restart') {
                    if (session.status === 'ended' && session.activityKey === 'rock_paper_scissors') {
                        // Reset the session for a new match
                        session.status = 'pending';
                        session.phase = 'lobby';
                        session.currentRound = 0;
                        session.moves = {};
                        session.roundWins = {};
                        session.scores = {};
                        session.winnerUserId = null;
                        session.lastRoundWinner = null;
                        session.lastRoundMoves = undefined;
                        session.leaveReason = undefined;
                        session.lobbyReady = false;
                        session.countdownValue = undefined;
                        // Reset ready status for all participants
                        session.participants.forEach((p) => {
                            p.ready = false;
                        });
                        broadcastGenericState(sessionId);
                        broadcastGenericPresence(sessionId);
                    }
                }
            } catch {
                /* ignore malformed messages */
            }
        });

        socket.addEventListener('close', () => {
            genericSockets[sessionId]?.delete(socket);

            // Handle disconnect - find which user this socket belonged to
            const userMap = genericUserSockets[sessionId];
            if (userMap) {
                let disconnectedUserId: string | null = null;
                for (const [userId, sock] of userMap.entries()) {
                    if (sock === socket) {
                        disconnectedUserId = userId;
                        break;
                    }
                }

                if (disconnectedUserId && session.status !== 'ended') {
                    console.log(`[Generic] User ${disconnectedUserId} disconnected from session ${sessionId}`);
                    userMap.delete(disconnectedUserId);

                    session.participants = session.participants.filter((p) => p.userId !== disconnectedUserId);
                    session.lobbyReady = session.participants.every((p) => p.ready);

                    // Forfeit if game was in progress
                    if (session.participants.length === 1 && (session.status === 'running' || session.status === 'countdown')) {
                        session.winnerUserId = session.participants[0].userId;
                        session.status = 'ended';
                        session.phase = 'ended';
                        session.leaveReason = 'opponent_left';
                        session.scores[session.winnerUserId] = (session.scores[session.winnerUserId] || 0) + 100;
                        broadcastGenericEnded(sessionId);
                    } else if (session.participants.length === 0) {
                        session.status = 'ended';
                        session.phase = 'ended';
                        session.leaveReason = 'opponent_left';
                    } else {
                        broadcastGenericPresence(sessionId);
                    }
                }
            }
        });
    });

    // Legacy endpoint for backward compatibility
    fastify.post('/activities/tictactoe/create', async (req, _reply) => {
        const body = req.body as { userId?: string } | undefined;
        const userId = body?.userId || 'anonymous';
        const sessionId = createTicTacToeSession(userId);
        return { sessionId };
    });

    // Standard session creation endpoint (used by all games)
    fastify.post('/activities/session', async (req, reply) => {
        const body = req.body as {
            activityKey?: string;
            creatorUserId?: string;
            participants?: string[];
            userId?: string;
            opponentId?: string;
        } | undefined;

        const activityKey = body?.activityKey;
        const creatorUserId = body?.creatorUserId || body?.userId || 'anonymous';
        const participants = Array.isArray(body?.participants)
            ? Array.from(new Set(body?.participants.filter((p): p is string => typeof p === 'string')))
            : [];

        // Rate limiting: check if user has too many pending sessions
        if (creatorUserId !== 'anonymous') {
            const pendingCount = getUserPendingSessionCount(creatorUserId);
            if (pendingCount >= MAX_PENDING_SESSIONS_PER_USER) {
                return reply.status(429).send({
                    error: 'rate_limit_exceeded',
                    message: `You have too many pending game invites (${pendingCount}). Please wait for them to expire or be accepted.`
                });
            }
        }

        if (activityKey === 'tictactoe' || activityKey === 'tic_tac_toe') {
            const sessionId = createTicTacToeSession(creatorUserId, body?.opponentId);
            trackUserSession(creatorUserId, sessionId);
            return { sessionId };
        }

        if (activityKey === 'quick_trivia') {
            const sessionId = createQuickTriviaSession(creatorUserId, participants);
            trackUserSession(creatorUserId, sessionId);
            return { sessionId };
        }

        if (activityKey === 'story_builder') {
            const sessionId = createStoryBuilderSession(creatorUserId, participants, (body as any).sessionId);
            trackUserSession(creatorUserId, sessionId);
            return { sessionId };
        }

        const supported: GenericSession['activityKey'][] = ['speed_typing', 'rock_paper_scissors'];
        if (!activityKey || !supported.includes(activityKey as GenericSession['activityKey'])) {
            return reply.status(400).send({ error: 'unsupported_activity', message: `Activity '${activityKey}' not supported by this service` });
        }

        const sessionId = `${activityKey}-${Math.random().toString(36).slice(2, 10)}`;
        const uniqueParticipants = participants.length > 0 ? participants : [creatorUserId];
        genericSessions[sessionId] = {
            id: sessionId,
            activityKey: activityKey as GenericSession['activityKey'],
            status: 'pending',
            phase: 'lobby',
            lobbyReady: false,
            creatorUserId,
            participants: uniqueParticipants.map((userId) => ({
                userId,
                joined: userId === creatorUserId,
                ready: false,
            })),
            createdAt: Date.now(),
            scores: {},
            winnerUserId: null,
        };
        trackUserSession(creatorUserId, sessionId);
        return { sessionId };
    });

    // List all sessions (with optional status filter)
    fastify.get('/activities/sessions', async (req, _reply) => {
        const { status } = req.query as { status?: string };
        let sessions = listTicTacToeSessions() as Array<ReturnType<typeof listTicTacToeSessions>[number] | GenericSession>;
        sessions = sessions.concat(listQuickTriviaSessions() as any);
        sessions = sessions.concat(listStoryBuilderSessions() as any);
        sessions = sessions.concat(Object.values(genericSessions));

        if (status && status !== 'all') {
            // Map frontend status to internal status
            const statusMap: Record<string, string[]> = {
                'pending': ['pending', 'lobby', 'ready', 'countdown'],
                'running': ['running', 'playing'],
                'ended': ['ended', 'finished'],
            };
            const allowedStatuses = statusMap[status] || [status];
            sessions = sessions.filter(s => allowedStatuses.includes((s as any).status));
        }

        return {
            sessions: sessions.map((s) => {
                if ((s as any).activityKey === 'tictactoe') {
                    const t = s as ReturnType<typeof listTicTacToeSessions>[number];
                    return {
                        id: t.sessionId,
                        activityKey: 'tictactoe',
                        status: t.status,
                        phase: t.phase,
                        lobbyReady: t.lobbyReady,
                        creatorUserId: t.creatorUserId,
                        participants: t.participants,
                        createdAt: t.createdAt,
                    };
                }
                if ((s as any).activityKey === 'quick_trivia') {
                    const q = s as { sessionId?: string; id?: string; status: string; phase: string; lobbyReady: boolean; creatorUserId: string; participants: Array<{ userId: string; joined: boolean; ready: boolean }>; createdAt: number; };
                    const resolvedId = q.sessionId ?? q.id ?? '';
                    return {
                        id: resolvedId,
                        activityKey: 'quick_trivia',
                        status: q.status as any,
                        phase: q.phase as any,
                        lobbyReady: q.lobbyReady,
                        creatorUserId: q.creatorUserId,
                        participants: q.participants || [],
                        createdAt: q.createdAt,
                    };
                }
                if ((s as any).activityKey === 'story_builder') {
                    const sb = s as { id: string; status: string; phase: string; lobbyReady: boolean; creatorUserId: string; participants: Array<{ userId: string; joined: boolean; ready: boolean }>; createdAt: number; };
                    return {
                        id: sb.id,
                        activityKey: 'story_builder',
                        status: sb.status as any,
                        phase: sb.phase as any,
                        lobbyReady: sb.lobbyReady,
                        creatorUserId: sb.creatorUserId,
                        participants: sb.participants || [],
                        createdAt: sb.createdAt,
                    };
                }
                const g = s as GenericSession;
                return {
                    id: g.id,
                    activityKey: g.activityKey,
                    status: g.status,
                    phase: g.phase,
                    lobbyReady: g.lobbyReady,
                    creatorUserId: g.creatorUserId,
                    participants: g.participants,
                    createdAt: g.createdAt,
                };
            }),
        };
    });

    // Get session state
    fastify.get('/activities/session/:sessionId', async (req, reply) => {
        const { sessionId } = req.params as { sessionId: string };
        const session = getSession(sessionId);
        if (session) {
            return { sessionId, ...session };
        }
        const sb = getStoryBuilderSession(sessionId);
        if (sb) {
            return sb;
        }
        const generic = genericSessions[sessionId];
        if (generic) {
            return generic;
        }
        return reply.status(404).send({ error: 'session_not_found' });
    });

    // Join session
    fastify.post('/activities/session/:sessionId/join', async (req, reply) => {
        const { sessionId } = req.params as { sessionId: string };
        const body = req.body as { userId?: string } | undefined;
        const userId = body?.userId || 'anonymous';

        try {
            const ttt = getSession(sessionId);
            if (ttt) {
                joinSession(sessionId, userId);
                const session = getSession(sessionId);
                return { sessionId, ...session };
            }

            const qt = getQuickTriviaSession(sessionId);
            if (qt) {
                return joinQuickTrivia(sessionId, userId);
            }

            const sb = getStoryBuilderSession(sessionId);
            if (sb) {
                return joinStoryBuilder(sessionId, userId);
            }

            const generic = genericSessions[sessionId];
            if (!generic) {
                return reply.status(404).send({ error: 'session_not_found' });
            }
            const existing = generic.participants.find((p) => p.userId === userId);
            if (existing) {
                existing.joined = true;
            } else {
                generic.participants.push({ userId, joined: true, ready: false });
            }
            generic.lobbyReady = generic.participants.every((p) => p.ready);
            broadcastGenericPresence(sessionId);
            return generic;
        } catch (e) {
            const message = e instanceof Error ? e.message : 'join_failed';
            return reply.status(400).send({ error: message });
        }
    });

    // Leave session
    fastify.post('/activities/session/:sessionId/leave', async (req, reply) => {
        const { sessionId } = req.params as { sessionId: string };
        const body = req.body as { userId?: string } | undefined;
        const userId = body?.userId || 'anonymous';

        try {
            // Check TicTacToe first
            const ttt = getSession(sessionId);
            if (ttt) {
                const result = leaveSession(sessionId, userId);
                return { success: true, sessionEnded: result.sessionEnded, winnerUserId: result.winnerUserId };
            }

            // Check Quick Trivia
            const qt = getQuickTriviaSession(sessionId);
            if (qt) {
                const result = leaveQuickTrivia(sessionId, userId);
                return { success: true, sessionEnded: result.sessionEnded, winnerUserId: result.winnerUserId };
            }

            // Check Story Builder
            const sb = getStoryBuilderSession(sessionId);
            if (sb) {
                const result = leaveStoryBuilder(sessionId, userId);
                return { success: true, sessionEnded: result.sessionEnded, winnerUserId: result.winnerUserId };
            }

            // Check generic sessions
            const generic = genericSessions[sessionId];
            if (generic) {
                // Remove from user-socket tracking
                genericUserSockets[sessionId]?.delete(userId);

                generic.participants = generic.participants.filter((p) => p.userId !== userId);
                generic.lobbyReady = generic.participants.every((p) => p.ready);

                // If game was in progress and only one participant remains, declare them winner by forfeit
                if (generic.participants.length === 1 && (generic.status === 'running' || generic.status === 'countdown')) {
                    generic.winnerUserId = generic.participants[0].userId;
                    generic.status = 'ended';
                    generic.phase = 'ended';
                    generic.leaveReason = 'opponent_left';
                    generic.scores[generic.winnerUserId] = (generic.scores[generic.winnerUserId] || 0) + 100; // Forfeit bonus
                    broadcastGenericEnded(sessionId);
                    return { success: true, sessionEnded: true, winnerUserId: generic.winnerUserId };
                } else if (generic.participants.length === 0) {
                    generic.status = 'ended';
                    generic.phase = 'ended';
                    generic.leaveReason = 'opponent_left';
                    return { success: true, sessionEnded: true };
                } else {
                    broadcastGenericPresence(sessionId);
                }
                return { success: true, sessionEnded: false };
            }

            return reply.status(404).send({ error: 'session_not_found' });
        } catch (e) {
            const message = e instanceof Error ? e.message : 'leave_failed';
            return reply.status(400).send({ error: message });
        }
    });

    // Set ready status
    fastify.post('/activities/session/:sessionId/ready', async (req, reply) => {
        const { sessionId } = req.params as { sessionId: string };
        const body = req.body as { userId?: string; ready?: boolean } | undefined;
        const userId = body?.userId || 'anonymous';
        const ready = body?.ready !== false;

        try {
            const ttt = getSession(sessionId);
            if (ttt) {
                setReady(sessionId, userId, ready);
                const session = getSession(sessionId);
                return { sessionId, ...session };
            }
            const qt = getQuickTriviaSession(sessionId);
            if (qt) {
                return setQuickTriviaReady(sessionId, userId, ready);
            }
            const sb = getStoryBuilderSession(sessionId);
            if (sb) {
                return setStoryBuilderReady(sessionId, userId, ready);
            }
            const generic = genericSessions[sessionId];
            if (!generic) {
                return reply.status(404).send({ error: 'session_not_found' });
            }
            const participant = generic.participants.find((p) => p.userId === userId);
            if (participant) {
                participant.ready = ready;
                participant.joined = true;
            } else {
                generic.participants.push({ userId, joined: true, ready });
            }
            generic.lobbyReady = generic.participants.every((p) => p.ready);
            // Auto-start generic sessions (e.g., speed_typing stub) when everyone is ready
            if (generic.lobbyReady && generic.status === 'pending' && generic.participants.length >= 2) {
                // Initialize RPS-specific fields
                if (generic.activityKey === 'rock_paper_scissors') {
                    generic.roundWins = {};
                    generic.currentRound = 0;
                    generic.moves = {};
                }

                broadcastGenericPresence(sessionId);

                // Use server-side countdown for RPS, old method for others
                if (generic.activityKey === 'rock_paper_scissors') {
                    startGenericCountdown(sessionId, () => {
                        const s = genericSessions[sessionId];
                        if (!s || s.status === 'ended') return;
                        s.status = 'running';
                        s.phase = 'running';
                        s.roundStartedAt = Date.now();
                        s.countdownValue = undefined;
                        broadcastGenericState(sessionId);
                        broadcastGenericRoundStarted(sessionId, s.currentRound ?? 0);
                    });
                } else {
                    generic.status = 'countdown';
                    generic.phase = 'countdown';
                    broadcastGenericCountdown(sessionId, GENERIC_COUNTDOWN_MS);
                    setTimeout(() => {
                        const s = genericSessions[sessionId];
                        if (!s || s.status === 'ended') return;
                        s.status = 'running';
                        s.phase = 'running';
                        s.roundStartedAt = Date.now();
                        broadcastGenericStarted(sessionId);
                        broadcastGenericRoundStarted(sessionId, 0);
                    }, GENERIC_COUNTDOWN_MS);
                }
            } else {
                broadcastGenericPresence(sessionId);
            }
            return generic;
        } catch (e) {
            const message = e instanceof Error ? e.message : 'ready_failed';
            return reply.status(400).send({ error: message });
        }
    });

    // Start session
    fastify.post('/activities/session/:sessionId/start', async (req, reply) => {
        const { sessionId } = req.params as { sessionId: string };

        try {
            const ttt = getSession(sessionId);
            if (ttt) {
                startSession(sessionId);
                const session = getSession(sessionId);
                return { sessionId, ...session };
            }
            const qt = getQuickTriviaSession(sessionId);
            if (qt) {
                // Quick trivia auto-starts on countdown; acknowledge with snapshot
                return qt;
            }
            const sb = getStoryBuilderSession(sessionId);
            if (sb) {
                return sb;
            }
            const generic = genericSessions[sessionId];
            if (!generic) {
                return reply.status(404).send({ error: 'session_not_found' });
            }

            // Initialize RPS-specific fields
            if (generic.activityKey === 'rock_paper_scissors') {
                generic.roundWins = {};
                generic.currentRound = 0;
                generic.moves = {};
            }

            broadcastGenericPresence(sessionId);

            // Use server-side countdown for RPS, old method for others
            if (generic.activityKey === 'rock_paper_scissors') {
                startGenericCountdown(sessionId, () => {
                    const s = genericSessions[sessionId];
                    if (!s || s.status === 'ended') return;
                    s.status = 'running';
                    s.phase = 'running';
                    s.roundStartedAt = Date.now();
                    s.countdownValue = undefined;
                    broadcastGenericRoundStarted(sessionId, s.currentRound ?? 0);
                });
            } else {
                generic.status = 'countdown';
                generic.phase = 'countdown';
                broadcastGenericCountdown(sessionId, GENERIC_COUNTDOWN_MS);
                setTimeout(() => {
                    const s = genericSessions[sessionId];
                    if (!s || s.status === 'ended') return;
                    s.status = 'running';
                    s.phase = 'running';
                    s.roundStartedAt = Date.now();
                    broadcastGenericStarted(sessionId);
                    broadcastGenericRoundStarted(sessionId, 0);
                }, GENERIC_COUNTDOWN_MS);
            }
            return generic;
        } catch (e) {
            const message = e instanceof Error ? e.message : 'start_failed';
            return reply.status(400).send({ error: message });
        }
    });
});


const start = async () => {
    try {
        await connectDb();
        const port = parseInt(process.env.PORT || '3001', 10);
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening on http://localhost:${port}`);

        // Start session cleanup interval (runs every 5 minutes)
        cleanupInterval = setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
        console.log('Session cleanup interval started (every 5 minutes)');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', () => {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }
    server.close();
});

start();
