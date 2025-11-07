import Image from "next/image";
import React from "react";

import type { FriendRow, PublicProfile } from "@/lib/types";

export type FriendProfileState = {
  profile: PublicProfile | null;
  loading: boolean;
  error: string | null;
};

interface FriendListProps {
  friends: FriendRow[];
  filter: "accepted" | "blocked" | "pending";
  onChangeFilter(filter: "accepted" | "blocked" | "pending"): void;
  onBlock(userId: string): void;
  onUnblock(userId: string): void;
  onRemove(userId: string): void;
  onChat(userId: string): void;
  profileData: Record<string, FriendProfileState>;
  onSelect(friendId: string): void;
  selectedFriendId: string | null;
  pendingContent?: React.ReactNode;
}

const FILTER_OPTIONS: Array<{ label: string; value: "accepted" | "blocked" | "pending" }> = [
  { label: "Friends", value: "accepted" },
  { label: "Blocked", value: "blocked" },
  { label: "Pending", value: "pending" },
];

export function FriendList({
  friends,
  filter,
  onChangeFilter,
  onBlock,
  onUnblock,
  onRemove,
  onChat,
  profileData,
  onSelect,
  selectedFriendId,
  pendingContent,
}: FriendListProps) {
  const renderAccepted = () => (
    <ul className="grid gap-4 sm:grid-cols-2">
      {friends.map((friend) => {
        const profileState = profileData[friend.friend_id];
        const profile = profileState?.profile ?? null;
        const rawPrimary =
          profile?.display_name ?? friend.friend_display_name ?? friend.friend_handle ?? friend.friend_id;
        const primaryLabel = rawPrimary && rawPrimary.trim().length > 0 ? rawPrimary : "Friend";
        const secondaryLabel = profile?.handle
          ? `@${profile.handle}`
          : friend.friend_handle
            ? `@${friend.friend_handle}`
            : friend.friend_id;
        const major = profile?.program ?? null;
        const passions = profile?.interests ?? [];
        const firstPassions = passions.slice(0, 3);
        const isSelected = selectedFriendId === friend.friend_id;
        const avatarUrl = profile?.avatar_url ?? null;
        const initial = primaryLabel.slice(0, 1).toUpperCase();

        return (
          <li
            key={`${friend.user_id}:${friend.friend_id}`}
            className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 transition ${
              isSelected ? "border-emerald-400 shadow-md" : "border-slate-200 shadow-sm hover:border-slate-300"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="relative h-20 w-20 shrink-0">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={primaryLabel} fill sizes="120px" className="rounded-3xl object-cover" />
                ) : profileState?.loading ? (
                  <div className="h-full w-full animate-pulse rounded-3xl bg-slate-200" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-3xl bg-slate-200 text-lg font-semibold text-slate-600">
                    {initial}
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(friend.friend_id)}
                  className="w-fit text-left text-base font-semibold text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  {primaryLabel}
                </button>
                <p className="text-xs text-slate-500">{secondaryLabel}</p>
                {profileState?.loading ? (
                  <p className="text-xs text-slate-400">Loading profile…</p>
                ) : profileState?.error ? (
                  <p className="text-xs text-rose-600">{profileState.error}</p>
                ) : (
                  <>
                    {major ? <p className="text-sm text-slate-600">{major}</p> : null}
                    {firstPassions.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {firstPassions.map((passion) => (
                          <span
                            key={passion}
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-medium text-amber-800"
                          >
                            {passion}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button
                className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 transition hover:bg-emerald-200"
                onClick={() => onChat(friend.friend_id)}
              >
                Chat
              </button>
              <button
                className="rounded-full bg-rose-100 px-3 py-1 text-rose-700 transition hover:bg-rose-200"
                onClick={() => onBlock(friend.friend_id)}
              >
                Block
              </button>
              <button
                className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 transition hover:bg-slate-200"
                onClick={() => onRemove(friend.friend_id)}
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const renderDefault = () => (
    <ul className="space-y-3">
      {friends.map((friend) => {
        const rawPrimary = friend.friend_display_name ?? friend.friend_handle ?? friend.friend_id;
        const primaryLabel = rawPrimary && rawPrimary.trim().length > 0 ? rawPrimary : "Friend";
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
            <div className="flex items-center gap-2 text-sm text-slate-600">
              {friend.status === "blocked" ? (
                <button className="rounded bg-slate-200 px-3 py-1" onClick={() => onUnblock(friend.friend_id)}>
                  Unblock
                </button>
              ) : (
                <span className="text-xs uppercase tracking-wide text-slate-500">{friend.status}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );

  let body: React.ReactNode;
  if (filter === "pending") {
    body = pendingContent ?? <p className="text-sm text-slate-500">No pending invites.</p>;
  } else if (friends.length === 0) {
    body = <p className="text-sm text-slate-500">No entries.</p>;
  } else if (filter === "accepted") {
    body = renderAccepted();
  } else {
    body = renderDefault();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`rounded px-3 py-1 text-sm transition ${
              option.value === filter ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
            onClick={() => onChangeFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {body}
    </div>
  );
}
