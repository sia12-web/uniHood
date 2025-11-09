import React from 'react';

type MiniParticipant = {
  userId: string;
  score: number;
  displayName?: string | null;
  handle?: string | null;
};

type ScoreboardMiniProps = {
  participants: MiniParticipant[];
  highlightUserId?: string;
  statusLabel?: string;
};

export const ScoreboardMini: React.FC<ScoreboardMiniProps> = ({ participants, highlightUserId, statusLabel }) => {
  const ordered = [...participants].sort((a, b) => {
    const diff = b.score - a.score;
    if (Math.abs(diff) > 1e-6) {
      return diff;
    }
    const nameA = (a.displayName ?? a.handle ?? a.userId).toLowerCase();
    const nameB = (b.displayName ?? b.handle ?? b.userId).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Scoreboard</span>
        {statusLabel ? <span className="text-xs uppercase tracking-wide text-amber-500">{statusLabel}</span> : null}
      </div>
      {ordered.length === 0 ? (
        <p className="text-xs text-slate-500">No scores yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {ordered.map((participant, index) => {
            const name = participant.displayName?.trim() || participant.handle?.trim() || participant.userId;
            const showHandle = participant.handle && participant.handle !== participant.displayName;
            const isWinner = participant.userId === highlightUserId;
            const accent = index === 0 ? 'text-slate-900' : 'text-slate-700';
            return (
              <li
                key={participant.userId}
                className={
                  `relative flex items-baseline justify-between rounded-lg border px-3 py-2 text-sm transition-all ` +
                  (isWinner
                    ? 'border-amber-300/90 bg-amber-50/90 shadow-sm shadow-amber-200 ring-1 ring-amber-200/60'
                    : 'border-slate-200 bg-white/60 hover:border-slate-300')
                }
              >
                <div className="flex flex-col">
                  <span className={`font-medium ${accent}`}>{name}</span>
                  {showHandle ? <span className="text-xs text-slate-500">@{participant.handle}</span> : null}
                </div>
                <span className={`font-mono text-slate-700 ${isWinner ? 'font-semibold text-slate-900' : ''}`}>
                  {participant.score.toFixed(2)}
                </span>
                {isWinner ? (
                  <span className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-base">
                    🏆
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
