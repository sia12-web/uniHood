import React from 'react';

export const SummaryView: React.FC<{ winnerUserId?: string; tieBreakWinnerUserId?: string; onRematch(): void }> = ({ winnerUserId, tieBreakWinnerUserId, onRematch }) => {
  return (
    <div className="p-4 border rounded">
      <div className="text-lg font-semibold mb-2">Match Summary</div>
      <div className="text-sm mb-3">
        {tieBreakWinnerUserId ? (
          <span>Winner by time advantage: <span className="font-bold">@{tieBreakWinnerUserId}</span></span>
        ) : winnerUserId ? (
          <span>Winner: <span className="font-bold">{winnerUserId}</span></span>
        ) : (
          <span>It’s a tie!</span>
        )}
      </div>
      <button onClick={onRematch} className="px-3 py-2 bg-blue-600 text-white rounded">Rematch</button>
    </div>
  );
};
