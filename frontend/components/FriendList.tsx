import React from "react";

import type { FriendRow } from "@/lib/types";

interface FriendListProps {
  friends: FriendRow[];
  filter: "accepted" | "blocked" | "pending";
  onChangeFilter(filter: "accepted" | "blocked" | "pending"): void;
  onBlock(userId: string): void;
  onUnblock(userId: string): void;
}

const FILTER_OPTIONS: Array<{ label: string; value: "accepted" | "blocked" | "pending" }> = [
  { label: "Friends", value: "accepted" },
  { label: "Blocked", value: "blocked" },
  { label: "Pending", value: "pending" },
];

export function FriendList({ friends, filter, onChangeFilter, onBlock, onUnblock }: FriendListProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`rounded px-3 py-1 text-sm ${option.value === filter ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"}`}
            onClick={() => onChangeFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {friends.length === 0 ? (
        <p className="text-sm text-slate-500">No entries.</p>
      ) : (
        <ul className="space-y-3">
          {friends.map((friend) => {
            const primaryLabel = friend.friend_display_name ?? friend.friend_handle ?? friend.friend_id;
            const secondaryLabel = friend.friend_handle ? `@${friend.friend_handle}` : friend.friend_id;
            return (
              <li
                key={`${friend.user_id}:${friend.friend_id}`}
                className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">{primaryLabel}</p>
                  <p className="text-xs text-slate-500">{secondaryLabel}</p>
                  <p className="text-xs text-slate-400">{new Date(friend.created_at).toLocaleString()}</p>
                </div>
                <div className="text-sm text-slate-600">
                  {friend.status === "blocked" ? (
                    <button className="rounded bg-slate-200 px-3 py-1" onClick={() => onUnblock(friend.friend_id)}>
                      Unblock
                    </button>
                  ) : filter === "accepted" ? (
                    <button className="rounded bg-rose-100 px-3 py-1 text-rose-700" onClick={() => onBlock(friend.friend_id)}>
                      Block
                    </button>
                  ) : (
                    <span className="text-xs uppercase tracking-wide text-slate-500">{friend.status}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
