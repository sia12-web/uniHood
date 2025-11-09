import React, { useState } from 'react';
import { createTypingDuel, startActivity } from '../api/client';
import { track } from '../../../../lib/analytics';

interface Props { peerUserId: string; onStarted(sessionId: string): void; }

export const ChooseActivityModal: React.FC<Props> = ({ peerUserId, onStarted }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true); setError(null);
    try {
      track('activity.start_click', { kind: 'typing_duel', peerId: peerUserId });
      const activity = await createTypingDuel(peerUserId);
      const started = await startActivity(activity.id);
      track('activity.session_started', { activityId: started.id, kind: 'typing_duel' });
      onStarted(started.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'failed';
      setError(message);
    } finally { setLoading(false); }
  }

  return (
    <div className="p-4 bg-white rounded shadow w-80">
      <h2 className="text-lg font-semibold mb-1">Who Types Faster</h2>
  <p className="text-sm text-gray-600 mb-3">Typing Duel • ~1–2 min</p>
      {error && <div className="text-red-600 text-xs mb-2">{error}</div>}
      <button disabled={loading} onClick={handleStart} className="px-3 py-2 bg-sky-600 text-white rounded w-full">
        {loading ? 'Starting…' : 'Start'}
      </button>
    </div>
  );
};
