"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";


import { FriendList, type FriendProfileState } from "@/components/FriendList";
import { InviteInbox } from "@/components/InviteInbox";

import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";
import { emitInviteCountRefresh } from "@/hooks/social/use-invite-count";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { fetchPublicProfile } from "@/lib/profiles";
import {
  acceptInvite,
  blockUser,
  cancelInvite,
  declineInvite,
  fetchFriends,
  fetchInviteInbox,
  fetchInviteOutbox,
  removeFriend,
  unblockUser,
} from "@/lib/social";
import { emitFriendshipFormed } from "@/lib/friends-events";
import type { FriendRow, InviteSummary, PublicProfile } from "@/lib/types";

type FriendFilter = "accepted" | "blocked" | "pending";

type InboxProfileStub = {
  profile: PublicProfile | null;
  loading: boolean;
  error: string | null;
};

function FriendsPageInner() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [filter, setFilter] = useState<FriendFilter>("accepted");
  const { hasNotification, acknowledge, latestFriendPeerId } = useFriendAcceptanceIndicator();

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  const [inbox, setInbox] = useState<InviteSummary[]>([]);
  const [outbox, setOutbox] = useState<InviteSummary[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [friendProfiles, setFriendProfiles] = useState<Record<string, FriendProfileState>>({});
  const friendProfileCacheRef = useRef<Map<string, PublicProfile>>(new Map());
  const friendProfilesStateRef = useRef<Record<string, FriendProfileState>>({});
  const pendingFriendFocusRef = useRef<string | null>(null);

  const [inviteProfileData, setInviteProfileData] = useState<Record<string, InboxProfileStub>>({});
  const inviteProfileCacheRef = useRef<Map<string, PublicProfile>>(new Map());
  const inviteProfilesStateRef = useRef<Record<string, InboxProfileStub>>({});

  useEffect(() => {
    friendProfilesStateRef.current = friendProfiles;
  }, [friendProfiles]);

  useEffect(() => {
    inviteProfilesStateRef.current = inviteProfileData;
  }, [inviteProfileData]);

  const searchParams = useSearchParams();

  const currentUserId = authUser?.userId ?? getDemoUserId();
  const currentCampusId = authUser?.campusId ?? getDemoCampusId();

  useEffect(() => {
    const raw = searchParams?.get("filter");
    if (raw === "accepted" || raw === "blocked" || raw === "pending") {
      setFilter(raw);
    }
    const focusParam = searchParams?.get("focus");
    if (focusParam) {
      pendingFriendFocusRef.current = focusParam;
    }
  }, [searchParams]);

  useEffect(() => {
    setAuthUser(readAuthUser());
    const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (!hasNotification) {
      return;
    }
    if (latestFriendPeerId) {
      pendingFriendFocusRef.current = latestFriendPeerId;
    }
    setFilter("accepted");
    acknowledge();
  }, [acknowledge, hasNotification, latestFriendPeerId]);

  const loadFriends = useCallback(
    async (scope: FriendFilter) => {
      setFriendsLoading(true);
      setFriendsError(null);
      try {
        const records = await fetchFriends(currentUserId, currentCampusId, scope);
        setFriends(records);
        if (scope === "accepted") {
          setSelectedFriendId((previous) => {
            const focusCandidate = pendingFriendFocusRef.current;
            if (focusCandidate && records.some((item) => item.friend_id === focusCandidate)) {
              pendingFriendFocusRef.current = null;
              return focusCandidate;
            }
            if (previous && records.some((item) => item.friend_id === previous)) {
              return previous;
            }
            const firstId = records[0]?.friend_id ?? null;
            return firstId;
          });
        } else {
          setSelectedFriendId(null);
        }
      } catch (err) {
        setFriendsError(err instanceof Error ? err.message : "Failed to load friends");
        setFriends([]);
      } finally {
        setFriendsLoading(false);
      }
    },
    [currentCampusId, currentUserId],
  );

  useEffect(() => {
    if (filter !== "pending") {
      void loadFriends(filter);
    }
  }, [filter, loadFriends]);

  useEffect(() => {
    if (filter !== "accepted") {
      return;
    }

    let aborted = false;
    const controllers = new Set<AbortController>();

    const friendHandleIndex = new Map<string, string>();
    for (const entry of friends) {
      if (entry.friend_handle) {
        friendHandleIndex.set(entry.friend_id, entry.friend_handle);
      }
    }

    const ensureProfile = async (friendId: string) => {
      const current = friendProfilesStateRef.current[friendId];
      if (current && (!current.loading || current.profile || current.error)) {
        return;
      }

      const cached = friendProfileCacheRef.current.get(friendId);
      if (cached) {
        setFriendProfiles((prev) => ({
          ...prev,
          [friendId]: { profile: cached, loading: false, error: null },
        }));
        return;
      }

      setFriendProfiles((prev) => ({
        ...prev,
        [friendId]: {
          profile: prev[friendId]?.profile ?? null,
          loading: true,
          error: null,
        },
      }));

      const controller = new AbortController();
      controllers.add(controller);
      try {
        const handle = friendHandleIndex.get(friendId);
        if (!handle) {
          if (!aborted) {
            setFriendProfiles((prev) => ({
              ...prev,
              [friendId]: {
                profile: prev[friendId]?.profile ?? null,
                loading: false,
                error: "Missing friend handle",
              },
            }));
          }
          return;
        }
        const profile = await fetchPublicProfile(handle, {
          userId: currentUserId,
          campusId: currentCampusId,
          signal: controller.signal,
        });
        friendProfileCacheRef.current.set(friendId, profile);
        if (!aborted) {
          setFriendProfiles((prev) => ({
            ...prev,
            [friendId]: { profile, loading: false, error: null },
          }));
        }
      } catch (err) {
        if (!aborted) {
          setFriendProfiles((prev) => ({
            ...prev,
            [friendId]: {
              profile: prev[friendId]?.profile ?? null,
              loading: false,
              error: err instanceof Error ? err.message : "Failed to load profile",
            },
          }));
        }
      }
    };

    const friendIds = Array.from(new Set(friends.map((friend) => friend.friend_id)));
    for (const friendId of friendIds) {
      void ensureProfile(friendId);
    }

    return () => {
      aborted = true;
      for (const controller of controllers) {
        controller.abort();
      }
    };
  }, [currentCampusId, currentUserId, filter, friends]);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const [inboxEntries, outboxEntries] = await Promise.all([
        fetchInviteInbox(currentUserId, currentCampusId),
        fetchInviteOutbox(currentUserId, currentCampusId),
      ]);
      setInbox(inboxEntries);
      setOutbox(outboxEntries);
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "Failed to load invites");
      setInbox([]);
      setOutbox([]);
    } finally {
      setPendingLoading(false);
    }
  }, [currentCampusId, currentUserId]);

  useEffect(() => {
    if (filter === "pending") {
      void loadPending();
    }
  }, [filter, loadPending]);

  const ensureInviteProfiles = useCallback(() => {
    if (filter !== "pending") {
      return () => undefined;
    }

    let aborted = false;
    const controllers = new Set<AbortController>();

    const upsert = (key: string, data: InboxProfileStub) => {
      setInviteProfileData((prev) => ({ ...prev, [key]: data }));
    };

    const ensureProfile = async (
      entry: InviteSummary & { kind: "incoming" | "outgoing"; peer_id: string; peer_handle: string | null },
    ) => {
      const key = `${entry.peer_id}:${entry.kind}`;
      const current = inviteProfilesStateRef.current[key];
      if (current && (!current.loading || current.profile)) {
        return;
      }

      const cached = inviteProfileCacheRef.current.get(entry.peer_id);
      if (cached) {
        upsert(key, { profile: cached, loading: false, error: null });
        return;
      }

      upsert(key, { profile: null, loading: true, error: null });

      const controller = new AbortController();
      controllers.add(controller);
      try {
        if (!entry.peer_handle) {
          if (!aborted) {
            upsert(key, {
              profile: null,
              loading: false,
              error: "Missing profile handle",
            });
          }
          return;
        }
        const profile = await fetchPublicProfile(entry.peer_handle, {
          userId: currentUserId,
          campusId: currentCampusId,
          signal: controller.signal,
        });
        inviteProfileCacheRef.current.set(entry.peer_id, profile);
        if (!aborted) {
          upsert(key, { profile, loading: false, error: null });
        }
      } catch (err) {
        if (!aborted) {
          upsert(key, {
            profile: null,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load profile",
          });
        }
      }
    };

    const pendingEntries: Array<
      InviteSummary & { kind: "incoming" | "outgoing"; peer_id: string; peer_handle: string | null }
    > = [
      ...inbox.map((entry) => ({
        ...entry,
        kind: "incoming" as const,
        peer_id: entry.from_user_id,
        peer_handle: entry.from_handle ?? null,
      })),
      ...outbox.map((entry) => ({
        ...entry,
        kind: "outgoing" as const,
        peer_id: entry.to_user_id,
        peer_handle: entry.to_handle ?? null,
      })),
    ];
    for (const entry of pendingEntries) {
      void ensureProfile(entry);
    }

    return () => {
      aborted = true;
      for (const controller of controllers) {
        controller.abort();
      }
    };
  }, [currentCampusId, currentUserId, filter, inbox, outbox]);

  useEffect(() => ensureInviteProfiles(), [ensureInviteProfiles]);

  const handleBlock = useCallback(
    async (userId: string) => {
      try {
        await blockUser(currentUserId, currentCampusId, userId);
        setStatusMessage("User blocked.");
        if (filter !== "pending") {
          await loadFriends(filter);
        }
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : "Failed to block user");
      }
    },
    [currentCampusId, currentUserId, filter, loadFriends],
  );

  const handleUnblock = useCallback(
    async (userId: string) => {
      try {
        await unblockUser(currentUserId, currentCampusId, userId);
        setStatusMessage("User unblocked.");
        if (filter !== "pending") {
          await loadFriends(filter);
        }
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : "Failed to unblock user");
      }
    },
    [currentCampusId, currentUserId, filter, loadFriends],
  );

  const handleRemove = useCallback(
    async (userId: string) => {
      try {
        await removeFriend(currentUserId, currentCampusId, userId);
        setStatusMessage("Friend removed.");
        if (filter !== "pending") {
          await loadFriends(filter);
        }
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : "Failed to remove friend");
      }
    },
    [currentCampusId, currentUserId, filter, loadFriends],
  );

  const handleChat = useCallback((userId: string) => {
    setSelectedFriendId(userId);
    const anchor = document.querySelector(`#conversation-${CSS.escape(userId)}`);
    if (anchor instanceof HTMLElement) {
      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleAccept = useCallback(
    async (inviteId: string) => {
      const invite = inbox.find((entry) => entry.id === inviteId);
      const newFriendId = invite?.from_user_id ?? null;
      try {
        await acceptInvite(currentUserId, currentCampusId, inviteId);
        setStatusMessage("Invite accepted.");
        emitInviteCountRefresh();
        if (newFriendId) {
          emitFriendshipFormed(newFriendId);
        }
        await loadPending();
        await loadFriends(filter === "pending" ? "accepted" : filter);
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : "Failed to accept invite");
      }
    },
    [currentCampusId, currentUserId, filter, inbox, loadFriends, loadPending],
  );

  const handleDecline = useCallback(
    async (inviteId: string) => {
      try {
        await declineInvite(currentUserId, currentCampusId, inviteId);
        setStatusMessage("Invite declined.");
        await loadPending();
        emitInviteCountRefresh();
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : "Failed to decline invite");
      }
    },
    [currentCampusId, currentUserId, loadPending],
  );

  const handleCancel = useCallback(
    async (inviteId: string) => {
      try {
        await cancelInvite(currentUserId, currentCampusId, inviteId);
        setStatusMessage("Invite cancelled.");
        await loadPending();
        emitInviteCountRefresh();
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : "Failed to cancel invite");
      }
    },
    [currentCampusId, currentUserId, loadPending],
  );

  const pendingContent = useMemo(
    () => (
      <div className="flex flex-col gap-3">
        {statusMessage ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {statusMessage}
          </div>
        ) : null}
        <InviteInbox
          inbox={inbox}
          outbox={outbox}
          loading={pendingLoading}
          error={pendingError}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onCancel={handleCancel}
          profileData={inviteProfileData}
        />
      </div>
    ),
    [handleAccept, handleCancel, handleDecline, inbox, inviteProfileData, outbox, pendingError, pendingLoading, statusMessage],
  );

  return (
    <div className="mx-auto max-w-2xl px-3 py-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Friends</h1>
        <Link href="/chat" className="text-sm font-semibold text-coral hover:text-coral/80">
          Open chats →
        </Link>
      </header>
      {statusMessage && filter !== "pending" ? (
        <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {statusMessage}
        </div>
      ) : null}
      <FriendList
        friends={friends}
        filter={filter}
        onChangeFilter={setFilter}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
        onRemove={handleRemove}
        onChat={handleChat}
        profileData={friendProfiles}
        onSelect={setSelectedFriendId}
        selectedFriendId={selectedFriendId}
        pendingContent={pendingContent}
      />
      {friendsError && filter !== "pending" ? <p className="mt-3 text-sm text-rose-700">{friendsError}</p> : null}
      {friendsLoading && filter !== "pending" ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : null}
    </div>
  );
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-3 py-6 text-sm text-slate-500">Loading friends…</div>}>
      <FriendsPageInner />
    </Suspense>
  );
}
