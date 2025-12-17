"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { useSearchParams, useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  MessageCircle,
  MoreHorizontal,
  Check,
  X,
  Shield,
  Loader2,
  UserMinus,
  Ban,
  ArrowLeft,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";
import { emitInviteCountRefresh, useInviteInboxCount } from "@/hooks/social/use-invite-count";
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

type FriendProfileState = {
  profile: PublicProfile | null;
  loading: boolean;
  error: string | null;
};

type InboxProfileStub = {
  profile: PublicProfile | null;
  loading: boolean;
  error: string | null;
};

// Memoized friend card to prevent re-renders when list updates
type FriendCardProps = {
  friend: FriendRow;
  profile: PublicProfile | null;
  isMenuOpen: boolean;
  onChat: (userId: string) => void;
  onRemove: (userId: string) => void;
  onBlock: (userId: string) => void;
  onToggleMenu: (friendId: string) => void;
};

const FriendCard = React.memo(function FriendCard({
  friend,
  profile,
  isMenuOpen,
  onChat,
  onRemove,
  onBlock,
  onToggleMenu,
}: FriendCardProps) {
  return (
    <div className="group relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
        {profile?.avatar_url ? (
          <Image src={profile.avatar_url} alt={friend.friend_display_name || ""} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-bold text-slate-400">
            {(friend.friend_display_name || "?")[0]}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold text-slate-900">{friend.friend_display_name}</h3>
        <p className="truncate text-sm text-slate-500">@{friend.friend_handle}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onChat(friend.friend_id)}
          className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
          title="Message"
        >
          <MessageCircle size={18} />
        </button>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(friend.friend_id);
            }}
            className="rounded-full bg-slate-50 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="More options"
          >
            <MoreHorizontal size={18} />
          </button>
          {isMenuOpen && (
            <div
              className="absolute right-0 top-full z-10 mt-2 w-48 origin-top-right rounded-xl border border-slate-100 bg-white p-1 shadow-lg ring-1 ring-black/5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  onRemove(friend.friend_id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                <UserMinus size={16} />
                Remove Friend
              </button>
              <button
                onClick={() => {
                  onBlock(friend.friend_id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Ban size={16} />
                Block User
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function FriendsPageInner() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [filter, setFilter] = useState<FriendFilter>("accepted");
  const { hasNotification, acknowledge, latestFriendPeerId } = useFriendAcceptanceIndicator();
  const { pendingCount } = useInviteInboxCount();

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  const [inbox, setInbox] = useState<InviteSummary[]>([]);
  const [outbox, setOutbox] = useState<InviteSummary[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (openMenuId !== null) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId !== null) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);

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
      try {
        const records = await fetchFriends(currentUserId, currentCampusId, scope);
        setFriends(records);
      } catch {
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
    try {
      const [inboxEntries, outboxEntries] = await Promise.all([
        fetchInviteInbox(currentUserId, currentCampusId),
        fetchInviteOutbox(currentUserId, currentCampusId),
      ]);
      setInbox(inboxEntries);
      setOutbox(outboxEntries);
    } catch {
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

  const router = useRouter();

  const handleChat = useCallback((userId: string) => {
    // Navigate to the chat page with this user
    router.push(`/chat/${userId}`);
  }, [router]);

  const handleToggleMenu = useCallback((friendId: string) => {
    setOpenMenuId((prev) => (prev === friendId ? null : friendId));
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

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Social</h1>
          </div>
          <Link
            href="/discovery"
            className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            <UserPlus size={16} />
            Find Friends
          </Link>
        </div>

        {/* Tabs */}
        <div className="mx-auto mt-6 flex max-w-2xl gap-8 px-2">
          <button
            onClick={() => setFilter("accepted")}
            className={cn(
              "relative pb-3 text-sm font-medium transition-colors",
              filter === "accepted" ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Friends
            {filter === "accepted" && (
              <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-slate-900" />
            )}
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={cn(
              "relative pb-3 text-sm font-medium transition-colors",
              filter === "pending" ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Requests
            {pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
            {filter === "pending" && (
              <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-slate-900" />
            )}
          </button>
          <button
            onClick={() => setFilter("blocked")}
            className={cn(
              "relative pb-3 text-sm font-medium transition-colors",
              filter === "blocked" ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Blocked
            {filter === "blocked" && (
              <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-slate-900" />
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4">
        {statusMessage && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
            <Check size={16} />
            {statusMessage}
          </div>
        )}

        {/* Friends Tab */}
        {filter === "accepted" && (
          <div className="space-y-6">
            {friendsLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
              </div>
            ) : friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 rounded-full bg-slate-100 p-6">
                  <Users className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No friends yet</h3>
                <p className="mt-2 max-w-xs text-sm text-slate-500">
                  Your circle is waiting to grow. Connect with classmates to see them here.
                </p>
                <Link
                  href="/discovery"
                  className="mt-6 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                  Find People
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {friends.map((friend) => {
                  const profile = friendProfiles[friend.friend_id]?.profile;
                  return (
                    <FriendCard
                      key={friend.friend_id}
                      friend={friend}
                      profile={profile ?? null}
                      isMenuOpen={openMenuId === friend.friend_id}
                      onChat={handleChat}
                      onRemove={handleRemove}
                      onBlock={handleBlock}
                      onToggleMenu={handleToggleMenu}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Requests Tab */}
        {filter === "pending" && (
          <div className="space-y-8">
            {pendingLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
              </div>
            ) : (
              <>
                {/* Incoming */}
                <section>
                  <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">Received ({inbox.length})</h3>
                  {inbox.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                      <p className="text-sm text-slate-500">No pending invitations.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {inbox.map((invite) => {
                        const profile = inviteProfileData[`${invite.from_user_id}:incoming`]?.profile;
                        return (
                          <div key={invite.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-100">
                              {profile?.avatar_url ? (
                                <Image src={profile.avatar_url} alt={invite.from_display_name || ""} fill className="object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center font-bold text-slate-400">
                                  {(invite.from_display_name || "?")[0]}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate font-bold text-slate-900">{invite.from_display_name}</h4>
                              <p className="truncate text-xs text-slate-500">@{invite.from_handle} • {new Date(invite.created_at).toLocaleDateString()}</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAccept(invite.id)}
                                className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800"
                              >
                                <Check size={14} />
                                Accept
                              </button>
                              <button
                                onClick={() => handleDecline(invite.id)}
                                className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
                              >
                                <X size={14} />
                                Decline
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Outgoing */}
                {outbox.length > 0 && (
                  <section>
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">Sent ({outbox.length})</h3>
                    <div className="space-y-3">
                      {outbox.map((invite) => {
                        const profile = inviteProfileData[`${invite.to_user_id}:outgoing`]?.profile;
                        return (
                          <div key={invite.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 opacity-75 grayscale transition hover:opacity-100 hover:grayscale-0">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
                              {profile?.avatar_url ? (
                                <Image src={profile.avatar_url} alt={invite.to_display_name || ""} fill className="object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center font-bold text-slate-400">
                                  {(invite.to_display_name || "?")[0]}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate font-bold text-slate-900">{invite.to_display_name}</h4>
                              <p className="truncate text-xs text-slate-500">@{invite.to_handle}</p>
                            </div>
                            <button
                              onClick={() => handleCancel(invite.id)}
                              className="text-xs font-medium text-rose-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* Blocked Tab */}
        {filter === "blocked" && (
          <div className="space-y-4">
            {friends.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Shield className="mx-auto mb-3 h-8 w-8 opacity-20" />
                <p>No blocked users.</p>
              </div>
            ) : (
              friends.map((friend) => (
                <div key={friend.friend_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-500">
                      {(friend.friend_display_name || "?")[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-700">{friend.friend_display_name}</p>
                      <p className="text-xs text-slate-500">Blocked</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblock(friend.friend_id)}
                    className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>}>
      <FriendsPageInner />
    </Suspense>
  );
}
