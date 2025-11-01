import React from 'react';

type Props = {
  name: string;
  capacity: number;
  preset: string;
  visibility: string;
  membersCount: number;
  joinCode?: string | null;
  onCopyJoinCode?: () => void;
};

export default function RoomHeader({ name, capacity, preset, visibility, membersCount, joinCode, onCopyJoinCode }: Props) {
  return (
    <header className="p-4 border-b flex items-center justify-between">
      <div>
        <h2 className="text-xl font-semibold">{name}</h2>
        <p className="text-sm text-muted-foreground">
          Preset {preset} · Capacity {capacity} · Members {membersCount} ·{' '}
          {visibility === 'link' ? 'Link join' : 'Private'}
        </p>
      </div>
      {visibility === 'link' && joinCode ? (
        <button
          type="button"
          className="text-sm text-blue-600 hover:text-blue-500"
          onClick={onCopyJoinCode}
        >
          Copy join code
        </button>
      ) : null}
    </header>
  );
}
