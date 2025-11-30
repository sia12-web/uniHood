import { checkWin, GameState } from './tictactoe';

describe('TicTacToe Logic', () => {
    function createSession(): GameState {
        return {
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
    }

    test('should detect horizontal win', () => {
        const session = createSession();
        session.board[0] = 'X'; session.board[1] = 'X'; session.board[2] = 'X';
        checkWin(session);
        expect(session.winner).toBe('X');
    });

    test('should detect vertical win', () => {
        const session = createSession();
        session.board[0] = 'O'; session.board[3] = 'O'; session.board[6] = 'O';
        checkWin(session);
        expect(session.winner).toBe('O');
    });

    test('should detect diagonal win', () => {
        const session = createSession();
        session.board[0] = 'X'; session.board[4] = 'X'; session.board[8] = 'X';
        checkWin(session);
        expect(session.winner).toBe('X');
    });

    test('should detect draw', () => {
        const session = createSession();
        session.board = [
            'X', 'O', 'X',
            'X', 'O', 'O',
            'O', 'X', 'X'
        ];
        checkWin(session);
        expect(session.winner).toBe('draw');
    });

    test('should not detect win on empty board', () => {
        const session = createSession();
        checkWin(session);
        expect(session.winner).toBeNull();
    });

    test('should not detect win on partial board', () => {
        const session = createSession();
        session.board[0] = 'X'; session.board[1] = 'X';
        checkWin(session);
        expect(session.winner).toBeNull();
    });
});
