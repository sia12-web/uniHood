import { describe, it, expect, vi, beforeEach } from 'vitest';

import { maybeRecordOutcome, resetOutcomeGuard } from '../app/features/activities/hooks/outcome-recorder';
import { recordGameOutcome } from '@/lib/leaderboards';

vi.mock('@/lib/leaderboards', () => ({
  recordGameOutcome: vi.fn(() => Promise.resolve()),
}));

type RefBool = { current: boolean };
const mockOutcome = recordGameOutcome as unknown as vi.Mock;

function createRef(): RefBool {
  return { current: false };
}

describe('maybeRecordOutcome', () => {
  beforeEach(() => {
    mockOutcome.mockClear();
  });

  it('does not record until session ends', () => {
    const ref = createRef();
    const ctx = {
      phase: 'running',
      leaveReason: null,
      scoreboard: [
        { userId: 'a', score: 1 },
        { userId: 'b', score: 2 },
      ],
      winnerUserId: 'b',
      selfUserId: 'a',
      gameKind: 'test_game',
      durationSeconds: 42,
      outcomeRecordedRef: ref,
    };

    const first = maybeRecordOutcome(ctx);
    expect(first).toBe(false);
    expect(mockOutcome).not.toHaveBeenCalled();

    const second = maybeRecordOutcome({ ...ctx, phase: 'ended' });
    expect(second).toBe(true);
    expect(mockOutcome).toHaveBeenCalledTimes(1);
  });

  it('records with provided winner', () => {
    const ref = createRef();
    maybeRecordOutcome({
      phase: 'ended',
      leaveReason: null,
      scoreboard: [
        { userId: 'a', score: 1 },
        { userId: 'b', score: 3 },
      ],
      winnerUserId: 'b',
      selfUserId: 'a',
      gameKind: 'speed_typing',
      durationSeconds: 60,
      outcomeRecordedRef: ref,
    });

    expect(mockOutcome).toHaveBeenCalledTimes(1);
    expect(mockOutcome).toHaveBeenCalledWith({
      userIds: ['a', 'b'],
      winnerId: 'b',
      gameKind: 'speed_typing',
      durationSeconds: 60,
    });
  });

  it('defaults winner to self when opponent leaves', () => {
    const ref = createRef();
    maybeRecordOutcome({
      phase: 'ended',
      leaveReason: 'opponent_left',
      scoreboard: [
        { userId: 'self', score: 0 },
        { userId: 'opponent', score: 5 },
      ],
      winnerUserId: null,
      selfUserId: 'self',
      gameKind: 'rock_paper_scissors',
      durationSeconds: 99,
      outcomeRecordedRef: ref,
    });

    expect(mockOutcome).toHaveBeenCalledWith({
      userIds: ['self', 'opponent'],
      winnerId: 'self',
      gameKind: 'rock_paper_scissors',
      durationSeconds: 99,
    });
  });

  it('does not double record without reset', () => {
    const ref = createRef();
    const ctx = {
      phase: 'ended',
      leaveReason: null,
      scoreboard: [
        { userId: 'a', score: 1 },
        { userId: 'b', score: 2 },
      ],
      winnerUserId: 'a',
      selfUserId: 'a',
      gameKind: 'quick_trivia',
      durationSeconds: 15,
      outcomeRecordedRef: ref,
    };

    const first = maybeRecordOutcome(ctx);
    const second = maybeRecordOutcome(ctx);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(mockOutcome).toHaveBeenCalledTimes(1);

    resetOutcomeGuard(ref);
    const third = maybeRecordOutcome(ctx);
    expect(third).toBe(true);
    expect(mockOutcome).toHaveBeenCalledTimes(2);
  });

  it('skips when fewer than two participants', () => {
    const ref = createRef();
    const result = maybeRecordOutcome({
      phase: 'ended',
      leaveReason: null,
      scoreboard: [{ userId: 'solo', score: 10 }],
      winnerUserId: 'solo',
      selfUserId: 'solo',
      gameKind: 'single',
      durationSeconds: 5,
      outcomeRecordedRef: ref,
    });

    expect(result).toBe(false);
    expect(mockOutcome).not.toHaveBeenCalled();
  });
});
