import { Server, Socket } from 'socket.io';
import { getSession, removeSession } from './sessionStore';
import { checkWin, checkDraw, isValidMove, getInitialBoard } from './gameLogic';
import { GameSession } from './types';

export function setupSocketHandlers(io: Server) {
    const gameNamespace = io.of('/game');

    gameNamespace.on('connection', (socket: Socket) => {
        console.log('Socket connected:', socket.id);

        socket.on('join_game', ({ sessionId, playerId }) => {
            const session = getSession(sessionId);
            if (!session) {
                socket.emit('error', { message: 'Session not found' });
                return;
            }

            socket.join(sessionId);
            // Store metadata on socket for disconnect handling
            (socket as any).sessionId = sessionId;
            (socket as any).playerId = playerId;

            // Notify others
            socket.to(sessionId).emit('player_joined', { playerId });

            // Send current state
            socket.emit('game_update', session);
        });

        socket.on('make_move', ({ sessionId, playerId, index }) => {
            const session = getSession(sessionId);
            if (!session) return;

            // Validate turn
            const player = session.players.find(p => p.id === playerId);
            if (!player || player.role !== session.turn) {
                socket.emit('error', { message: 'Not your turn' });
                return;
            }

            if (session.status !== 'playing') {
                socket.emit('error', { message: 'Game not active' });
                return;
            }

            // Validate move
            if (!isValidMove(session.board, index)) {
                socket.emit('error', { message: 'Invalid move' });
                return;
            }

            // Apply move
            session.board[index] = player.role;

            // Check win/draw
            const winResult = checkWin(session.board);
            if (winResult) {
                session.status = 'finished';
                session.winner = winResult.winner;
                session.winningLine = winResult.line;
            } else if (checkDraw(session.board)) {
                session.status = 'finished';
                session.winner = 'draw';
            } else {
                // Switch turn
                session.turn = session.turn === 'X' ? 'O' : 'X';
            }

            // Broadcast update
            gameNamespace.to(sessionId).emit('game_update', session);
        });

        socket.on('request_rematch', ({ sessionId, playerId }) => {
            const session = getSession(sessionId);
            if (!session) return;

            // Store rematch requests (in a real app, track who requested)
            // For MVP, if one requests, we can just reset or wait for both.
            // Let's implement simple "reset immediately" for now or better:
            // We need to track consent. Let's add `rematchRequested: string[]` to session?
            // For simplicity: If game is finished, reset board and swap roles.

            if (session.status !== 'finished') return;

            // Reset logic
            session.board = getInitialBoard();
            session.status = 'playing';
            session.winner = null;
            session.winningLine = null;
            // Swap X and O roles for players?
            // Or just swap who starts. Usually loser starts or swap.
            // Let's swap the `turn` to the other player.
            // And keep player roles same? Or swap roles?
            // Swapping roles is complex if IDs are tied to roles.
            // Let's just swap who starts.
            // If previous winner was X, O starts.
            // Or just alternate.
            // Let's just set turn to X (or whoever lost).
            session.turn = 'X';

            gameNamespace.to(sessionId).emit('game_update', session);
        });

        socket.on('disconnect', () => {
            const sessionId = (socket as any).sessionId;
            const playerId = (socket as any).playerId;

            if (sessionId && playerId) {
                const session = getSession(sessionId);
                if (session) {
                    // Handle player disconnect
                    // For now, maybe pause game or just notify?
                    // If session is empty, remove it?
                    // We'll leave it simple.
                    console.log(`Player ${playerId} disconnected from session ${sessionId}`);
                }
            }
        });
    });
}
