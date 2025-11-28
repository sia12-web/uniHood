import { checkWin, checkDraw, isValidMove, getInitialBoard } from './gameLogic';
import { createSession, getSession, getSessionByCode } from './sessionStore';
import { BoardState } from './types';

describe('Game Logic', () => {
    test('should detect horizontal win', () => {
        const board: BoardState = getInitialBoard();
        board[0] = 'X'; board[1] = 'X'; board[2] = 'X';
        expect(checkWin(board)).toEqual({ winner: 'X', line: [0, 1, 2] });
    });

    test('should detect vertical win', () => {
        const board: BoardState = getInitialBoard();
        board[0] = 'O'; board[3] = 'O'; board[6] = 'O';
        expect(checkWin(board)).toEqual({ winner: 'O', line: [0, 3, 6] });
    });

    test('should detect diagonal win', () => {
        const board: BoardState = getInitialBoard();
        board[0] = 'X'; board[4] = 'X'; board[8] = 'X';
        expect(checkWin(board)).toEqual({ winner: 'X', line: [0, 4, 8] });
    });

    test('should detect draw', () => {
        const board: BoardState = [
            'X', 'O', 'X',
            'X', 'O', 'O',
            'O', 'X', 'X'
        ];
        expect(checkDraw(board)).toBe(true);
        expect(checkWin(board)).toBeNull();
    });

    test('should validate moves', () => {
        const board: BoardState = getInitialBoard();
        expect(isValidMove(board, 0)).toBe(true);
        board[0] = 'X';
        expect(isValidMove(board, 0)).toBe(false); // Occupied
        expect(isValidMove(board, 9)).toBe(false); // Out of bounds
    });
});

describe('Session Store', () => {
    test('should create session', () => {
        const session = createSession();
        expect(session.id).toBeDefined();
        expect(session.code).toHaveLength(6);
        expect(getSession(session.id)).toBe(session);
        expect(getSessionByCode(session.code)).toBe(session);
    });
});
