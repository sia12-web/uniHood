"use client";

import { useEffect, useMemo, useState } from "react";

import { readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { fetchFriends } from "@/lib/social";
import type { FriendRow } from "@/lib/types";

export type FriendIdentity = {
  userId: string;
  displayName?: string | null;
  handle?: string | null;
};

export type FriendIdentityResult = {
  map: Map<string, FriendIdentity>;
  loading: boolean;
  error: string | null;
  authUser: AuthUser | null;
};

function normalizeFriendLabel(friend: FriendRow): FriendIdentity | null {
  if (!friend.friend_id) {
    return null;
  }
  return {
    userId: friend.friend_id,
    displayName: friend.friend_display_name?.trim() || null,
    handle: friend.friend_handle?.trim() || null,
  };
}

export function useFriendIdentities(): FriendIdentityResult {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => readAuthUser());
  const [map, setMap] = useState<Map<string, FriendIdentity>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAuthUser(readAuthUser());
  }, []);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      const currentUser = authUser ?? readAuthUser();
      const fallbackUser = currentUser?.userId ?? getDemoUserId();
      if (!fallbackUser) {
        setMap(new Map());
        setLoading(false);
        setError("unauthenticated");
        return;
      }
      try {
        const campusId = currentUser?.campusId ?? getDemoCampusId();
        const friends = await fetchFriends(fallbackUser, campusId ?? null, "accepted");
        if (!active) return;
        const next = new Map<string, FriendIdentity>();
        friends.forEach((row) => {
          const normalized = normalizeFriendLabel(row);
          if (normalized) {
            next.set(normalized.userId, normalized);
          }
        });
        setMap(next);
        setError(null);
      } catch (err) {
        if (!active) return;
        setMap(new Map());
        setError(err instanceof Error ? err.message : "Failed to load friends");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [authUser?.userId, authUser?.campusId]);

  return useMemo(
    () => ({ map, loading, error, authUser }),
    [map, loading, error, authUser],
  );
}
