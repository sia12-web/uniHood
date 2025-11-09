import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => {
  const post = vi.fn();
  const get = vi.fn();
  const create = vi.fn(() => ({ post, get }));
  return {
    default: { create, post, get },
  } as unknown as typeof import('axios');
});

import axios from 'axios';
import { createTypingDuel, startActivity, fetchTypingPrompt, submitTyping } from '@/app/features/activities/api/client';

describe('activities API client', () => {
  const mocked = axios as unknown as { create: any; post: any; get: any };

  beforeEach(() => {
    mocked.post.mockReset();
    mocked.get.mockReset();
  });

  it('creates and starts a typing duel', async () => {
    mocked.post
      .mockResolvedValueOnce({ data: { id: 'act-1', kind: 'typing_duel', state: 'new', user_a: 'u1', user_b: 'u2', meta: {} } })
      .mockResolvedValueOnce({ data: { id: 'act-1', kind: 'typing_duel', state: 'running', user_a: 'u1', user_b: 'u2', meta: {} } });

    const created = await createTypingDuel('u2');
    expect(created.id).toBe('act-1');

    const started = await startActivity(created.id);
    expect(started.state).toBe('running');
  });

  it('fetches prompt and submits typing', async () => {
    mocked.get.mockResolvedValueOnce({ data: { prompt: 'hello world', duration_s: 60, close_at_ms: Date.now() + 60000 } });
    const prompt = await fetchTypingPrompt('act-1');
    expect(prompt.prompt).toContain('hello');

    mocked.post.mockResolvedValueOnce({ data: { activity_id: 'act-1', totals: { u1: 42, u2: 39 }, per_round: [] } });
    const score = await submitTyping('act-1', 1, 'hello world');
    expect(score.totals.u1).toBe(42);
  });
});
