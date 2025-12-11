import { recordGameOutcome } from '@/lib/leaderboards';

export type OutcomeContext = {
  phase: string;
  leaveReason?: string | null;
  scoreboard: Array<{ userId: string; score: number }>;
  winnerUserId?: string | null;
  selfUserId: string;
  gameKind: string;
  durationSeconds: number;
  outcomeRecordedRef: { current: boolean };
};

/**
 * Records a game outcome once per session when the session is ended or someone leaves.
 * Returns true when a submission was attempted, false otherwise.
 */
export function maybeRecordOutcome(context: OutcomeContext): boolean {
  const { phase, leaveReason, scoreboard, winnerUserId, selfUserId, gameKind, durationSeconds, outcomeRecordedRef } = context;
  const ended = phase === 'ended' || Boolean(leaveReason);
  if (!ended || outcomeRecordedRef.current) {
    return false;
  }

  const participants = Array.from(new Set(scoreboard.map((p) => p.userId).filter(Boolean)));
  if (participants.length < 2) {
    return false;
  }

  outcomeRecordedRef.current = true;

  const winnerId =
    winnerUserId ??
    (leaveReason === 'opponent_left' ? selfUserId : null) ??
    (participants.length > 0 ? participants[0] : null);

  recordGameOutcome({
    userIds: participants,
    winnerId,
    gameKind,
    durationSeconds,
  }).catch((err) => {
    console.error('Failed to record game outcome:', err);
  });

  return true;
}

export function resetOutcomeGuard(ref: { current: boolean }) {
  ref.current = false;
}
