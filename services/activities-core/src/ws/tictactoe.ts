import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';

export interface GameState {
    board: (string | null)[];
    turn: 'X' | 'O';
    winner: string | null;
    players: { X?: string; O?: string };
    spectators: string[];
}

const sessions: Record<string, GameState> = {};
const connections: Record<string, Set<any>> = {};

export function handleTicTacToeConnection(connection: SocketStream, _req: FastifyRequest, sessionId: string) {
    const socket = connection.socket;
    console.log(`New connection to session ${sessionId}`);

    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            board: Array(9).fill(null),
            turn: 'X',
            winner: null,
            players: {},
            spectators: []
        };
        connections[sessionId] = new Set();
    }

    // const session = sessions[sessionId];
    connections[sessionId].add(socket);

    // Handle join
    // We expect a "join" message or we infer from query params?
    // useQuickTriviaSession sends nothing on connect, but maybe expects messages.
    // Let's implement a simple protocol.

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
        else session.spectators.push(userId);

        broadcastState(sessionId);
    } else if (data.type === 'move') {
        const { index, userId } = data.payload;
        if (session.winner) return;

        const role = session.players.X === userId ? 'X' : session.players.O === userId ? 'O' : null;
        if (!role || session.turn !== role) return;

        if (session.board[index] === null) {
            session.board[index] = role;
            session.turn = role === 'X' ? 'O' : 'X';
            checkWin(session);
            broadcastState(sessionId);
        }
    } else if (data.type === 'restart') {
        session.board = Array(9).fill(null);
        session.turn = 'X';
        session.winner = null;
        broadcastState(sessionId);
    }
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
