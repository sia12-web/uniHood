import React from 'react';

import { RoomMemberSummary } from '../lib/rooms';

type Props = {
  members: RoomMemberSummary[];
  onMute?: (userId: string, muted: boolean) => void;
  onKick?: (userId: string) => void;
  canModerate?: boolean;
};

export default function RoomRoster({ members, onMute, onKick, canModerate }: Props) {
  return (
    <aside className="w-64 border-r p-4 space-y-3">
      <h3 className="font-bold">Members ({members.length})</h3>
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.user_id} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{member.user_id}</span>
              <span className="ml-2 text-xs uppercase text-muted-foreground">{member.role}</span>
              {member.muted ? <span className="ml-2 text-xs text-red-500">Muted</span> : null}
              <div className="text-xs text-muted-foreground">
                Joined {new Date(member.joined_at).toLocaleDateString()}
              </div>
            </div>
            {canModerate && member.role !== 'owner' ? (
              <div className="flex gap-1">
                <button
                  className="text-xs text-blue-600 hover:text-blue-500"
                  onClick={() => onMute?.(member.user_id, !member.muted)}
                >
                  {member.muted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  className="text-xs text-red-600 hover:text-red-500"
                  onClick={() => onKick?.(member.user_id)}
                >
                  Kick
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
