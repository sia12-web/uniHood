import { checkWin, createSession, handleRoundEnd, GameState } from './tictactoe';

// Mock dependencies
jest.mock('../services/stats', () => ({
    recordGameResult: jest.fn(),
}));

describe('TicTacToe Logic', () => {
    let sessionCounter = 0;

    beforeAll(() => {
        jest.useFakeTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    // Helper to setup a test session
    function setupSession(): { session: GameState, sessionId: string } {
        sessionCounter++;
        const sessionId = `test-session-${sessionCounter}`;
        const session = createSession(sessionId, 'user1', []);
        session.players.X = 'user1';
        session.players.O = 'user2';
        session.ready['user1'] = true;
        session.ready['user2'] = true;
        return { session, sessionId };
    }

    test('should detect horizontal win', () => {
        const { session } = setupSession();
        session.board[0] = 'X'; session.board[1] = 'X'; session.board[2] = 'X';
        checkWin(session);
        expect(session.winner).toBe('X');
    });

    test('should detect vertical win', () => {
        const { session } = setupSession();
        session.board[0] = 'O'; session.board[3] = 'O'; session.board[6] = 'O';
        checkWin(session);
        expect(session.winner).toBe('O');
    });

    test('should detect diagonal win', () => {
        const { session } = setupSession();
        session.board[0] = 'X'; session.board[4] = 'X'; session.board[8] = 'X';
        checkWin(session);
        expect(session.winner).toBe('X');
    });

    test('should detect draw', () => {
        const { session } = setupSession();
        session.board = [
            'X', 'O', 'X',
            'X', 'O', 'O',
            'O', 'X', 'X'
        ];
        checkWin(session);
        expect(session.winner).toBe('draw');
    });

    test('should not match ends early (Best of 3 behavior removed)', () => {
        const { session, sessionId } = setupSession();

        // Round 1: X wins
        session.winner = 'X';
        handleRoundEnd(sessionId);
        expect(session.roundWins['user1']).toBe(1);
        expect(session.roundIndex).toBe(1);
        expect(session.status).toBe('countdown'); // playing next round

        // Round 2: X wins again
        session.winner = 'X';
        handleRoundEnd(sessionId);
        expect(session.roundWins['user1']).toBe(2);
        expect(session.roundIndex).toBe(2);
        // Should NOT be finished yet, because we play fixed 3 rounds
        expect(session.status).toBe('countdown');
    });

    test('should end match after 3 rounds', () => {
        const { session, sessionId } = setupSession();

        // Simulate 2 rounds played
        session.roundIndex = 2;
        session.roundWins['user1'] = 2; // X has 2 wins
        session.roundWins['user2'] = 0; // O has 0 wins

        // Round 3: O wins
        session.winner = 'O';
        handleRoundEnd(sessionId);

        expect(session.roundWins['user2']).toBe(1);
        expect(session.status).toBe('finished');
        expect(session.matchWinner).toBe('user1'); // X won 2-1
    });

    test('should handle draw match', () => {
        // Since we have 3 rounds, draws are only possible if there are draws in rounds.
        // e.g. R1:X, R2:O, R3:Draw -> 1-1. Match Draw?
        const { session, sessionId } = setupSession();

        session.roundIndex = 2;
        session.roundWins['user1'] = 1;
        session.roundWins['user2'] = 1;

        // Round 3: Draw
        session.winner = 'draw';
        handleRoundEnd(sessionId);

        expect(session.status).toBe('finished');
        expect(session.matchWinner).toBeNull(); // Draw
    });
});
