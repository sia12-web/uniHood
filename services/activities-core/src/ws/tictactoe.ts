import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';
import { recordGameResult } from '../services/stats';

export interface GameState {
    board: (string | null)[];
    turn: 'X' | 'O';
    winner: string | null;
    players: { X?: string; O?: string };
    spectators: string[];
    status: 'lobby' | 'ready' | 'countdown' | 'playing' | 'finished';
    ready: Record<string, boolean>;
    scores: Record<string, number>;
    roundWins: Record<string, number>;
    countdown: number | null;
    invitedOpponentId?: string;
    creatorUserId?: string;
    roundIndex: number;
    lastRoundWinner?: string | null;
    matchWinner?: string | null;
    leaveReason?: 'opponent_left' | 'forfeit' | null;
}

const sessions: Record<string, GameState> = {};
const connections: Record<string, Set<any>> = {};
const countdowns: Record<string, NodeJS.Timeout> = {};
const userSockets: Record<string, Map<string, any>> = {}; // sessionId -> userId -> socket
const ROUND_WIN_TARGET = 2; // Best of 3 - first to 2 wins

// Exported session management functions for REST API integration
export function createSession(sessionId: string, _creatorUserId: string, _participants: string[]): GameState {
    sessions[sessionId] = {
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        players: {},
        spectators: [],
        status: 'lobby',
        ready: {},
        scores: {},
        roundWins: {},
        countdown: null,
        roundIndex: 0,
        lastRoundWinner: null,
        matchWinner: null,
    };
    connections[sessionId] = new Set();
    return sessions[sessionId];
}

export function getSession(sessionId: string): GameState | undefined {
    return sessions[sessionId];
}

export function hasSession(sessionId: string): boolean {
    return sessionId in sessions;
}

export function listSessions(): Array<{
    sessionId: string;
    activityKey: 'tictactoe';
    status: 'pending' | 'running' | 'ended';
    phase: 'lobby' | 'countdown' | 'running' | 'ended';
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
}> {
    return Object.entries(sessions).map(([sessionId, session]) => {
        const participants: Array<{ userId: string; joined: boolean; ready: boolean }> = [];
        const addParticipant = (userId: string | undefined, joined: boolean) => {
            if (!userId) return;
            const ready = !!session.ready[userId];
            participants.push({ userId, joined, ready });
        };

        addParticipant(session.creatorUserId, !!session.players.X || !!session.players.O);
        addParticipant(session.players.X, !!session.players.X);
        addParticipant(session.players.O, !!session.players.O);
        if (session.invitedOpponentId && !participants.some(p => p.userId === session.invitedOpponentId)) {
            participants.push({ userId: session.invitedOpponentId, joined: false, ready: false });
        }

        const hasBothReady = (() => {
            const x = session.players.X;
            const o = session.players.O;
            if (!x || !o) return false;
            return !!session.ready[x] && !!session.ready[o];
        })();

        return {
            sessionId,
            activityKey: 'tictactoe',
            status: session.status === 'finished' ? 'ended' : session.status === 'playing' ? 'running' : 'pending',
            phase: session.status === 'finished' ? 'ended' : session.status === 'playing' ? 'running' : 'lobby',
            lobbyReady: hasBothReady,
            creatorUserId: session.creatorUserId || 'anonymous',
            participants,
        };
    });
}

// Create a new session and return the sessionId
export function createTicTacToeSession(creatorUserId: string, opponentId?: string): string {
    const sessionId = `ttt-${Math.random().toString(36).substring(2, 10)}`;
    sessions[sessionId] = {
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        players: {},
        spectators: [],
        status: 'lobby',
        ready: {},
        scores: {},
        roundWins: {},
        countdown: null,
        invitedOpponentId: opponentId,
        creatorUserId,
        roundIndex: 0,
        lastRoundWinner: null,
        matchWinner: null,
    };
    connections[sessionId] = new Set();
    return sessionId;
}

// Join an existing session
export function joinSession(sessionId: string, userId: string, preferredRole?: 'X' | 'O'): void {
    const session = sessions[sessionId];
    if (!session) {
        throw new Error('session_not_found');
    }

    // Assign player role or add as spectator
    let assigned = false;

    // Check if user is already a player
    if (session.players.X === userId || session.players.O === userId) {
        assigned = true;
    } else {
        const isCreator = session.creatorUserId === userId;
        const isInvited = session.invitedOpponentId === userId;
        const hasInvitation = !!session.invitedOpponentId;

        if (hasInvitation) {
            if (isCreator) {
                if (preferredRole === 'O' && !session.players.O) { session.players.O = userId; assigned = true; }
                else if (!session.players.X) { session.players.X = userId; assigned = true; }
                else if (!session.players.O) { session.players.O = userId; assigned = true; }
            } else if (isInvited) {
                if (preferredRole === 'X' && !session.players.X) { session.players.X = userId; assigned = true; }
                else if (!session.players.O) { session.players.O = userId; assigned = true; }
                else if (!session.players.X) { session.players.X = userId; assigned = true; }
            }
        } else {
            if (preferredRole === 'X' && !session.players.X) { session.players.X = userId; assigned = true; }
            else if (preferredRole === 'O' && !session.players.O) { session.players.O = userId; assigned = true; }
            else if (!session.players.X) { session.players.X = userId; assigned = true; }
            else if (!session.players.O) { session.players.O = userId; assigned = true; }
        }
    }

    if (!assigned && !session.spectators.includes(userId)) {
        session.spectators.push(userId);
    }

    // Initialize score if new
    if (!session.scores[userId]) {
        session.scores[userId] = 0;
    }

    broadcastState(sessionId);
}

// Leave a session with forfeit logic
export function leaveSession(sessionId: string, userId: string): { sessionEnded: boolean; winnerUserId?: string } {
    const session = sessions[sessionId];
    if (!session) {
        throw new Error('session_not_found');
    }

    // Remove user from socket tracking
    userSockets[sessionId]?.delete(userId);

    const wasPlayerX = session.players.X === userId;
    const wasPlayerO = session.players.O === userId;

    if (wasPlayerX) {
        session.players.X = undefined;
    } else if (wasPlayerO) {
        session.players.O = undefined;
    } else {
        session.spectators = session.spectators.filter(s => s !== userId);
    }

    // Reset ready state for the leaving user
    delete session.ready[userId];

    // If game was in progress (countdown or playing), forfeit
    if ((wasPlayerX || wasPlayerO) && (session.status === 'playing' || session.status === 'countdown')) {
        const remainingPlayerId = wasPlayerX ? session.players.O : session.players.X;
        
        if (remainingPlayerId) {
            // Award win to remaining player
            session.matchWinner = remainingPlayerId;
            session.scores[remainingPlayerId] = (session.scores[remainingPlayerId] || 0) + 300; // Forfeit win bonus
            session.status = 'finished';
            session.leaveReason = 'opponent_left';

            // Record stats
            recordGameResult(remainingPlayerId, 'tictactoe', 'win', session.scores[remainingPlayerId]);
            recordGameResult(userId, 'tictactoe', 'loss', 0);

            // Clear countdown if running
            if (countdowns[sessionId]) {
                clearInterval(countdowns[sessionId]);
                delete countdowns[sessionId];
            }

            broadcastState(sessionId);
            return { sessionEnded: true, winnerUserId: remainingPlayerId };
        }
    }

    broadcastState(sessionId);
    return { sessionEnded: false };
}

// Set ready status for a user
export function setReady(sessionId: string, userId: string, ready: boolean): void {
    const session = sessions[sessionId];
    if (!session) {
        throw new Error('session_not_found');
    }

    session.ready[userId] = ready;

    const playerX = session.players.X;
    const playerO = session.players.O;
    const bothPresent = !!playerX && !!playerO;
    const bothReady = bothPresent && session.ready[playerX] && session.ready[playerO];
    const autoAdvance = session.roundIndex >= 1;

    if (bothPresent && !session.countdown && session.status !== 'playing') {
        if (autoAdvance || bothReady) {
            startCountdown(sessionId);
        }
    } else if (!autoAdvance && session.status === 'countdown' && !bothReady) {
        clearInterval(countdowns[sessionId]);
        session.status = 'lobby';
        session.countdown = null;
    }

    broadcastState(sessionId);
}

// Start a session (force start)
export function startSession(sessionId: string): void {
    const session = sessions[sessionId];
    if (!session) {
        throw new Error('session_not_found');
    }

    if (!session.players.X || !session.players.O) {
        throw new Error('not_enough_players');
    }

    startCountdown(sessionId);
}

// Handle disconnect
function handleDisconnect(sessionId: string, socket: any) {
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
        console.log(`[TicTacToe] User ${disconnectedUserId} disconnected from session ${sessionId}`);
        leaveSession(sessionId, disconnectedUserId);
    }
}

export function handleTicTacToeConnection(connection: SocketStream, _req: FastifyRequest, sessionId: string) {
    const socket = connection.socket;
    console.log(`New connection to session ${sessionId}`);

    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            board: Array(9).fill(null),
            turn: 'X',
            winner: null,
            players: {},
            spectators: [],
            status: 'lobby',
            ready: {},
            scores: {},
            roundWins: {},
            countdown: null,
            roundIndex: 0
        };
        connections[sessionId] = new Set();
    }

    connections[sessionId].add(socket);
    
    // Track connected user (will be set on join message)
    let connectedUserId: string | null = null;

    socket.on('message', (message: Buffer) => {
        try {
            const data = JSON.parse(message.toString());
            // Capture userId from join message for disconnect tracking
            if (data.type === 'join' && data.payload?.userId) {
                connectedUserId = data.payload.userId;
                if (!userSockets[sessionId]) userSockets[sessionId] = new Map();
                userSockets[sessionId].set(connectedUserId, socket);
            }
            handleMessage(socket, sessionId, data);
        } catch (e) {
            console.error('Failed to parse message', e);
        }
    });

    socket.on('close', () => {
        connections[sessionId].delete(socket);
        // Handle disconnect for forfeit logic
        if (connectedUserId) {
            handleDisconnect(sessionId, socket);
        }
    });

    // Send initial state
    sendState(socket, sessionId);
}

function handleMessage(socket: any, sessionId: string, data: any) {
    const session = sessions[sessionId];
    if (!session) return;

    if (data.type === 'join') {
        const { userId, role } = data.payload;
        try {
            joinSession(sessionId, userId, role);
        } catch (e) {
            console.error('Failed to join session', e);
        }
    } else if (data.type === 'ready') {
        const { userId } = data.payload;
        setReady(sessionId, userId, !session.ready[userId]);

        const playerX = session.players.X;
        const playerO = session.players.O;

        const bothPresent = !!playerX && !!playerO;
        const bothReady = bothPresent && session.ready[playerX] && session.ready[playerO];
        const autoAdvance = session.roundIndex >= 1;

        if (bothPresent && !session.countdown && session.status !== 'playing') {
            if (autoAdvance || bothReady) {
                startCountdown(sessionId);
            }
        }
        // setReady already broadcasted state
    } else if (data.type === 'move') {
        const { index, userId } = data.payload;
        if (session.status !== 'playing' || session.winner) return;

        const role = session.players.X === userId ? 'X' : session.players.O === userId ? 'O' : null;
        if (!role || session.turn !== role) return;

        if (session.board[index] === null) {
            session.board[index] = role;
            session.turn = role === 'X' ? 'O' : 'X';
            checkWin(session);

            if (session.winner) {
                handleRoundEnd(sessionId);
            }
            broadcastState(sessionId);
        }
    } else if (data.type === 'restart') {
        // Only allow restart if game is finished
        if (session.status === 'finished') {
            session.board = Array(9).fill(null);
            session.turn = 'X'; // Winner starts? Or alternate? Let's stick to X for now.
            session.winner = null;
            session.status = 'lobby'; // Go back to lobby to ready up again
            session.ready = {}; // Reset ready state
            broadcastState(sessionId);
        }
    }
}

function startCountdown(sessionId: string) {
    const session = sessions[sessionId];
    if (!session.players.X || !session.players.O) {
        return;
    }
    session.status = 'countdown';
    session.countdown = 3;
    session.lastRoundWinner = null;
    broadcastState(sessionId);

    if (countdowns[sessionId]) clearInterval(countdowns[sessionId]);

    countdowns[sessionId] = setInterval(() => {
        if (session.countdown && session.countdown > 0) {
            session.countdown--;
            broadcastState(sessionId);
        } else {
            clearInterval(countdowns[sessionId]);
            session.status = 'playing';
            session.countdown = null;
            broadcastState(sessionId);
        }
    }, 1000);
}

export function checkWin(session: GameState) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (const [a, b, c] of lines) {
        if (session.board[a] && session.board[a] === session.board[b] && session.board[a] === session.board[c]) {
            session.winner = session.board[a];
            return;
        }
    }

    if (!session.board.includes(null)) {
        session.winner = 'draw';
    }
}

function handleRoundEnd(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;

    let matchOver = false;
    let roundWinnerId: string | null = null;
    if (session.winner && session.winner !== 'draw') {
        const winnerId = session.players[session.winner as 'X' | 'O'];
        if (winnerId) {
            session.roundWins[winnerId] = (session.roundWins[winnerId] || 0) + 1;
            roundWinnerId = winnerId;
            if (session.roundWins[winnerId] >= ROUND_WIN_TARGET) {
                matchOver = true;
                session.matchWinner = winnerId;
            }
        }
    }

    if (matchOver) {
        const pX = session.players.X!;
        const pO = session.players.O!;
        const winsX = session.roundWins[pX] || 0;
        const winsO = session.roundWins[pO] || 0;

        const calculatePoints = (winnerWins: number, loserWins: number) => {
            if (loserWins === 0) return 300; // 2-0
            if (loserWins === 1) return 200; // 2-1
            return 150; // fallback
        };

        if (session.matchWinner === pX) {
            session.scores[pX] = calculatePoints(winsX, winsO);
            session.scores[pO] = winsO * 50;
            recordGameResult(pX, 'tictactoe', 'win', session.scores[pX]);
            recordGameResult(pO, 'tictactoe', 'loss', session.scores[pO]);
        } else {
            session.scores[pO] = calculatePoints(winsO, winsX);
            session.scores[pX] = winsX * 50;
            recordGameResult(pO, 'tictactoe', 'win', session.scores[pO]);
            recordGameResult(pX, 'tictactoe', 'loss', session.scores[pX]);
        }

        session.status = 'finished';
        session.lastRoundWinner = roundWinnerId;
        session.roundIndex += 1;
        return;
    }

    // Auto-start next round
    session.lastRoundWinner = roundWinnerId;
    session.roundIndex += 1;
    session.board = Array(9).fill(null);
    session.turn = 'X';
    session.winner = null;
    session.status = 'lobby';
    session.countdown = null;
    if (session.players.X) session.ready[session.players.X] = true;
    if (session.players.O) session.ready[session.players.O] = true;
    startCountdown(sessionId);
}

function broadcastState(sessionId: string) {
    const session = sessions[sessionId];
    const state = JSON.stringify({ type: 'state', payload: session });
    connections[sessionId].forEach(client => {
        if (client.readyState === 1) { // OPEN
            client.send(state);
        }
    });
}

function sendState(socket: any, sessionId: string) {
    const session = sessions[sessionId];
    if (session) {
        socket.send(JSON.stringify({ type: 'state', payload: session }));
    }
}
