"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { fetchFriends } from "@/lib/social";

export type ChatRosterEntry = {
  peerId: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  isDemo?: boolean;
};

export type UseChatRosterResult = {
  entries: ChatRosterEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  authUser: AuthUser | null;
};

export function useChatRoster(): UseChatRosterResult {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [entries, setEntries] = useState<ChatRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAuthUser(readAuthUser());
    const unsubscribe = onAuthChange(() => {
      setAuthUser(readAuthUser());
    });
    return unsubscribe;
  }, []);

  const userId = authUser?.userId ?? getDemoUserId();
  const campusId = authUser?.campusId ?? getDemoCampusId();

  const refresh = useCallback(async () => {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const friends = await fetchFriends(userId, campusId ?? null, "accepted");
      const mapped = friends
        .filter((row) => row.friend_id && row.status === "accepted")
        .map<ChatRosterEntry>((row) => ({
          peerId: row.friend_id,
          displayName: row.friend_display_name?.trim() || "Friend",
          handle: row.friend_handle ?? null,
          avatarUrl: null,
          isDemo: false,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      setEntries(mapped);
    } catch (err) {
      console.error("Failed to load chat roster", err);
      setError(err instanceof Error ? err.message : "Failed to load chats");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [userId, campusId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      entries,
      loading,
      error,
      refresh,
      authUser,
    }),
    [entries, loading, error, refresh, authUser],
  );
}
