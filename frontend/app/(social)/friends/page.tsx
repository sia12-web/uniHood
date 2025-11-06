"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FriendList } from "@/components/FriendList";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { getSocialSocket } from "@/lib/socket";
import { blockUser, fetchFriends, unblockUser } from "@/lib/social";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import type { FriendRow } from "@/lib/types";

type FriendFilter = "accepted" | "blocked" | "pending";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [filter, setFilter] = useState<FriendFilter>("accepted");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const latestFilterRef = useRef<FriendFilter>("accepted");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const currentUserId = authUser?.userId ?? DEMO_USER_ID;
  const currentCampusId = authUser?.campusId ?? DEMO_CAMPUS_ID;

  const fetchFriendsFor = useCallback(async (status: FriendFilter) => {
    setLoading(true);
    try {
      const rows = await fetchFriends(currentUserId, currentCampusId, status);
      setFriends(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load friends");
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, currentCampusId]);

  useEffect(() => {
    setAuthUser(readAuthUser());
    const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
    return cleanup;
  }, []);

  useEffect(() => {
    latestFilterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    void fetchFriendsFor(filter);
  }, [fetchFriendsFor, filter]);

  const socket = useMemo(() => getSocialSocket(currentUserId, currentCampusId), [currentUserId, currentCampusId]);

  useEffect(() => {
    const refresh = () => {
      void fetchFriendsFor(latestFilterRef.current);
    };
    socket.on("friend:update", refresh);
    socket.emit("subscribe_self");
    return () => {
      socket.off("friend:update", refresh);
    };
  }, [socket, fetchFriendsFor]);

  const handleFilterChange = useCallback((nextFilter: FriendFilter) => {
    setStatusMessage(null);
    setActionError(null);
    setFilter(nextFilter);
  }, []);

  const handleBlock = useCallback(
    async (targetUserId: string) => {
      setActionError(null);
      setStatusMessage(null);
      try {
  await blockUser(currentUserId, currentCampusId, targetUserId);
        setStatusMessage("User blocked.");
        await fetchFriendsFor(latestFilterRef.current);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to block user");
      }
    },
    [fetchFriendsFor, currentUserId, currentCampusId],
  );

  const handleUnblock = useCallback(
    async (targetUserId: string) => {
      setActionError(null);
      setStatusMessage(null);
      try {
  await unblockUser(currentUserId, currentCampusId, targetUserId);
        setStatusMessage("User unblocked.");
        await fetchFriendsFor(latestFilterRef.current);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to unblock user");
      }
    },
    [fetchFriendsFor, currentUserId, currentCampusId],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Friends & Blocks</h1>
        <p className="text-sm text-slate-600">Review your friendships and manage block status.</p>
      </header>
      {statusMessage ? (
        <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{statusMessage}</p>
      ) : null}
      {error ? (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {actionError && !error ? (
        <p className="rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{actionError}</p>
      ) : null}
      {loading ? <p className="text-sm text-slate-500">Loading friends…</p> : null}
      <FriendList
        friends={friends}
        filter={filter}
        onChangeFilter={handleFilterChange}
        onBlock={(userId) => void handleBlock(userId)}
        onUnblock={(userId) => void handleUnblock(userId)}
      />
    </main>
  );
}
