"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { getSocialSocket } from "@/lib/socket";
import { fetchFriends } from "@/lib/social";
import type { FriendRow } from "@/lib/types";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();
const MAX_PREVIEW = 5;

function friendPrimaryLabel(friend: FriendRow): string {
  return friend.friend_display_name ?? friend.friend_handle ?? friend.friend_id;
}

function friendSecondaryLabel(friend: FriendRow): string {
  if (friend.friend_handle) {
    return `@${friend.friend_handle}`;
  }
  return friend.friend_id;
}

export function FriendsSnapshot() {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const { hasNotification: hasFriendAcceptanceNotification } = useFriendAcceptanceIndicator();

  const currentUserId = authUser?.userId ?? DEMO_USER_ID;
  const currentCampusId = authUser?.campusId ?? DEMO_CAMPUS_ID;

  useEffect(() => {
    setAuthUser(readAuthUser());
    const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
    return cleanup;
  }, []);

  const loadFriends = useCallback(async () => {
    if (!hasLoaded) {
      setLoading(true);
    }
    try {
      const rows = await fetchFriends(currentUserId, currentCampusId, "accepted");
      setFriends(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load friends");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [hasLoaded, currentUserId, currentCampusId]);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const socket = useMemo(() => getSocialSocket(currentUserId, currentCampusId), [currentUserId, currentCampusId]);

  useEffect(() => {
    const handleUpdate = () => {
      void loadFriends();
    };
    socket.on("friend:update", handleUpdate);
    socket.emit("subscribe_self");
    return () => {
      socket.off("friend:update", handleUpdate);
    };
  }, [socket, loadFriends]);

  const visibleFriends = friends.slice(0, MAX_PREVIEW);
  const hasOverflow = friends.length > MAX_PREVIEW;
  const manageHref = hasFriendAcceptanceNotification ? "/friends?filter=pending" : "/friends";

  return (
    <aside className="flex flex-col rounded-2xl border border-warm-sand bg-glass p-5 shadow-soft">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Friends</p>
        <h2 className="text-lg font-semibold text-navy">Quick roster</h2>
        <p className="text-xs text-navy/60">Peek at your accepted friends without leaving the hub.</p>
      </header>
      {loading ? (
        <p className="text-sm text-navy/60">Loading friends…</p>
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : visibleFriends.length === 0 ? (
        <p className="text-sm text-navy/60">No accepted friends yet.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {visibleFriends.map((friend) => (
            <li key={friend.friend_id} className="rounded-lg border border-transparent bg-white/70 px-3 py-2 shadow-sm transition hover:border-warm-sand">
              <p className="text-sm font-medium text-navy">{friendPrimaryLabel(friend)}</p>
              <p className="text-xs text-navy/60">{friendSecondaryLabel(friend)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between text-sm">
        <span className="text-navy/60">{friends.length} total</span>
        <Link href={manageHref} className="font-medium text-midnight hover:underline">
          Manage friends →
        </Link>
      </div>
      {hasOverflow ? (
        <p className="mt-2 text-xs text-navy/50">Showing first {MAX_PREVIEW} friends.</p>
      ) : null}
    </aside>
  );
}
