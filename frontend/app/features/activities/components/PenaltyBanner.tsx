import React from 'react';

type Props = { message: string };

export const PenaltyBanner: React.FC<Props> = ({ message }) => {
  return (
    <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status" aria-live="assertive">
      ⚠️ {message}
    </div>
  );
};
