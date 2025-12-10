import { 
    createStoryBuilderSession, 
    joinStoryBuilder, 
    setStoryBuilderReady, 
    handleMessage, 
    startStory,
    getStoryBuilderSession 
} from './storyBuilder';
import { recordGameResult } from '../services/stats';

jest.mock('../services/stats', () => ({
    recordGameResult: jest.fn()
}));

describe('StoryBuilder Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should create session and allow users to join', () => {
        const sessionId = createStoryBuilderSession('user1');
        const session = getStoryBuilderSession(sessionId);
        
        expect(session).toBeDefined();
        expect(session?.creatorUserId).toBe('user1');
        expect(session?.participants).toHaveLength(1);

        joinStoryBuilder(sessionId, 'user2');
        expect(session?.participants).toHaveLength(2);
    });

    test('should start game when everyone is ready', () => {
        const sessionId = createStoryBuilderSession('user1');
        joinStoryBuilder(sessionId, 'user2');

        setStoryBuilderReady(sessionId, 'user1', true);
        const session = getStoryBuilderSession(sessionId);
        expect(session?.status).toBe('pending'); // Waiting for user2

        setStoryBuilderReady(sessionId, 'user2', true);
        expect(session?.status).toBe('countdown');

        jest.advanceTimersByTime(5000);
        expect(session?.status).toBe('writing');
        expect(session?.turnOrder).toHaveLength(2);
        expect(session?.currentTurnUserId).toBeDefined();
    });

    test('should handle writing and voting flow', () => {
        const sessionId = createStoryBuilderSession('user1');
        joinStoryBuilder(sessionId, 'user2');
        
        // Skip to writing phase
        startStory(sessionId);
        const session = getStoryBuilderSession(sessionId)!;
        
        // Mock turn order to be deterministic
        session.turnOrder = ['user1', 'user2'];
        session.currentTurnUserId = 'user1';
        session.turnIndex = 0;

        // User 1 writes
        handleMessage(sessionId, { 
            type: 'submit_paragraph', 
            payload: { userId: 'user1', text: 'Once upon a time' } 
        });
        
        expect(session.paragraphs).toHaveLength(1);
        expect(session.currentTurnUserId).toBe('user2');

        // User 2 writes
        handleMessage(sessionId, { 
            type: 'submit_paragraph', 
            payload: { userId: 'user2', text: 'There was a dragon' } 
        });

        expect(session.paragraphs).toHaveLength(2);
        expect(session.currentTurnUserId).toBe('user1');

        // Fill up paragraphs to trigger voting (3 per user * 2 users = 6 total)
        // We already have 2. Need 4 more.
        const turns = [
            { u: 'user1', t: 'p3' },
            { u: 'user2', t: 'p4' },
            { u: 'user1', t: 'p5' },
            { u: 'user2', t: 'p6' }
        ];

        for (const turn of turns) {
            handleMessage(sessionId, { 
                type: 'submit_paragraph', 
                payload: { userId: turn.u, text: turn.t } 
            });
        }

        expect(session.status).toBe('voting');

        // Voting Phase
        // User 1 votes on User 2's paragraphs (indices 1, 3, 5)
        handleMessage(sessionId, { type: 'vote_paragraph', payload: { userId: 'user1', paragraphIndex: 1, score: 10 } });
        handleMessage(sessionId, { type: 'vote_paragraph', payload: { userId: 'user1', paragraphIndex: 3, score: 10 } });
        handleMessage(sessionId, { type: 'vote_paragraph', payload: { userId: 'user1', paragraphIndex: 5, score: 10 } });

        // User 2 votes on User 1's paragraphs (indices 0, 2, 4)
        handleMessage(sessionId, { type: 'vote_paragraph', payload: { userId: 'user2', paragraphIndex: 0, score: 5 } });
        handleMessage(sessionId, { type: 'vote_paragraph', payload: { userId: 'user2', paragraphIndex: 2, score: 5 } });
        handleMessage(sessionId, { type: 'vote_paragraph', payload: { userId: 'user2', paragraphIndex: 4, score: 5 } });

        expect(session.status).toBe('ended');
        expect(session.winnerUserId).toBe('user2'); // User 2 got 30 points, User 1 got 15 points

        // Verify stats recorded
        expect(recordGameResult).toHaveBeenCalledWith('user2', 'story_builder', 'win', 30);
        expect(recordGameResult).toHaveBeenCalledWith('user1', 'story_builder', 'loss', 15);
    });
});
