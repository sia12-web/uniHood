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

    test('should match continue normally (Best of 5)', () => {
        const { session, sessionId } = setupSession();

        // Round 1: X wins
        session.winner = 'X';
        handleRoundEnd(sessionId);
        expect(session.roundWins['user1']).toBe(1);
        expect(session.roundIndex).toBe(1);
        expect(session.status).toBe('lobby'); // waiting in lobby during delay

        jest.advanceTimersByTime(3000);
        expect(session.status).toBe('countdown');

        // Round 2: User 1 (now O) wins again
        session.winner = 'O';
        handleRoundEnd(sessionId);
        expect(session.roundWins['user1']).toBe(2);
        expect(session.roundIndex).toBe(2);
        // Total 2 wins, but target is 3. Should continue.
        expect(session.status).toBe('lobby');
    });

    test('should end match after WIN_TARGET reached (3 wins)', () => {
        const { session, sessionId } = setupSession();

        // Simulate 2 rounds played
        session.roundIndex = 2;
        session.roundWins['user1'] = 2;
        session.roundWins['user2'] = 0;

        // Round 3: X wins (3rd win)
        session.winner = 'X';
        handleRoundEnd(sessionId);

        expect(session.roundWins['user1']).toBe(3);
        expect(session.status).toBe('finished');
        expect(session.matchWinner).toBe('user1');
    });

    test('should end match after TOTAL_ROUNDS reached (5 rounds)', () => {
        const { session, sessionId } = setupSession();

        // Simulate 4 rounds played
        session.roundIndex = 4;
        session.roundWins['user1'] = 1;
        session.roundWins['user2'] = 1;
        // 2 draws or something

        // Round 5: O wins
        session.winner = 'O';
        handleRoundEnd(sessionId);

        expect(session.roundWins['user2']).toBe(2);
        expect(session.status).toBe('finished');
        expect(session.matchWinner).toBe('user2'); // 2-1
    });

    test('should handle draw match after 5 rounds', () => {
        const { session, sessionId } = setupSession();

        session.roundIndex = 4;
        session.roundWins['user1'] = 2;
        session.roundWins['user2'] = 2;

        // Round 5: Draw
        session.winner = 'draw';
        handleRoundEnd(sessionId);

        expect(session.status).toBe('finished');
        expect(session.matchWinner).toBeNull(); // Draw
    });
});
