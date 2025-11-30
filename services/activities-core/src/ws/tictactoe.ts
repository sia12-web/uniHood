import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';

export interface GameState {
    board: (string | null)[];
    turn: 'X' | 'O';
    winner: string | null;
    players: { X?: string; O?: string };
    spectators: string[];
    status: 'lobby' | 'ready' | 'countdown' | 'playing' | 'finished';
    ready: Record<string, boolean>;
    scores: Record<string, number>;
    countdown: number | null;
}

const sessions: Record<string, GameState> = {};
const connections: Record<string, Set<any>> = {};
const countdowns: Record<string, NodeJS.Timeout> = {};

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
            countdown: null
        };
        connections[sessionId] = new Set();
    }

    connections[sessionId].add(socket);

    socket.on('message', (message: Buffer) => {
        try {
            const data = JSON.parse(message.toString());
            handleMessage(socket, sessionId, data);
        } catch (e) {
            console.error('Failed to parse message', e);
        }
    });

    socket.on('close', () => {
        connections[sessionId].delete(socket);
        // Handle disconnect (remove player?)
    });

    // Send initial state
    sendState(socket, sessionId);
}

function handleMessage(socket: any, sessionId: string, data: any) {
    const session = sessions[sessionId];
    if (!session) return;

    if (data.type === 'join') {
        const { userId, role } = data.payload;
        if (role === 'X' && !session.players.X) session.players.X = userId;
        else if (role === 'O' && !session.players.O) session.players.O = userId;
        else if (!session.players.X) session.players.X = userId; // Auto-assign X
        else if (!session.players.O) session.players.O = userId; // Auto-assign O
        else session.spectators.push(userId);

        // Initialize score if new
        if (!session.scores[userId]) session.scores[userId] = 0;

        broadcastState(sessionId);
    } else if (data.type === 'ready') {
        const { userId } = data.payload;
        session.ready[userId] = !session.ready[userId]; // Toggle ready

        // Check if both players are present and ready
        const playerX = session.players.X;
        const playerO = session.players.O;

        if (playerX && playerO && session.ready[playerX] && session.ready[playerO]) {
            startCountdown(sessionId);
        } else {
            // Cancel countdown if someone unreadies
            if (session.status === 'countdown') {
                clearInterval(countdowns[sessionId]);
                session.status = 'lobby';
                session.countdown = null;
            }
        }
        broadcastState(sessionId);
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
                session.status = 'finished';
                if (session.winner !== 'draw') {
                    const winnerId = session.players[session.winner as 'X' | 'O'];
                    if (winnerId) {
                        session.scores[winnerId] = (session.scores[winnerId] || 0) + 1;
                        // TODO: Persist score to DB
                    }
                }
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
    session.status = 'countdown';
    session.countdown = 3;
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
