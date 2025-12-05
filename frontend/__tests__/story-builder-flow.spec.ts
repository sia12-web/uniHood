import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios before importing client
vi.mock('axios', () => {
    const post = vi.fn();
    const get = vi.fn();
    const create = vi.fn(() => ({ post, get }));
    return {
        default: { create, post, get },
    } as unknown as typeof import('axios');
});

// Mock getSelf
vi.mock('@/app/features/activities/api/client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/app/features/activities/api/client')>();
    return {
        ...actual,
        getSelf: () => 'user-me',
    };
});

import axios from 'axios';
import { createStoryBuilderSession } from '@/app/features/activities/api/client';

describe('Story Builder Flow', () => {
    const mocked = axios as unknown as { create: any; post: any; get: any };

    beforeEach(() => {
        mocked.post.mockReset();
        mocked.get.mockReset();
        vi.restoreAllMocks();
    });

    it('createStoryBuilderSession calls backend first then activities-core', async () => {
        // 1. Mock backend response (Python) via axios
        mocked.post.mockResolvedValueOnce({
            data: {
                id: '7484afce-5a1d-45d2-8059-58575693a81f',
                kind: 'story_builder',
                state: 'lobby'
            }
        });

        // 2. Mock activities-core response (Node) via fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ sessionId: 'sb-7484afce' }),
        });

        const result = await createStoryBuilderSession('user-friend');

        // Verify backend call
        expect(mocked.post).toHaveBeenNthCalledWith(1, '/activities/with/user-friend', {
            kind: 'story_builder',
            options: {}
        });

        // Verify activities-core call
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/activities/session'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"sessionId":"7484afce-5a1d-45d2-8059-58575693a81f"')
            })
        );

        // Check result
        expect(result.sessionId).toBe('sb-7484afce');
    });
});
