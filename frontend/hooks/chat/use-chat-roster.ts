"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { initChatSocket, onMessage, type ChatMessage } from "@/lib/chat";
import {
  acknowledgeConversation,
  bindChatUnreadSocket,
  getUnreadCounts,
  setActiveChatPeer,
  subscribeUnreadCounts,
} from "@/lib/chat/unread-manager";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { fetchFriends } from "@/lib/social";
import { markPresenceFromActivity } from "@/store/presence";

export type ChatRosterEntry = {
  peerId: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  isDemo?: boolean;
  lastMessageSnippet?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
};

export type UseChatRosterResult = {
  entries: ChatRosterEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  authUser: AuthUser | null;
  setActiveConversation: (peerId: string | null) => void;
  updateConversationSnapshot: (peerId: string, message: ChatMessage | null) => void;
};

const SOCKET_BASE_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:8000";

function truncateSnippet(body: string | null | undefined): string | null {
  if (!body) {
    return null;
  }
  const compact = body.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }
  return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}

function sortRoster(entries: ChatRosterEntry[]): ChatRosterEntry[] {
  return [...entries].sort((a, b) => {
    const aTime = a.lastMessageAt ?? "";
    const bTime = b.lastMessageAt ?? "";
    if (aTime && bTime && aTime !== bTime) {
      return bTime.localeCompare(aTime);
    }
    if (aTime) {
      return -1;
    }
    if (bTime) {
      return 1;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

function attachmentSummary(message: ChatMessage): string | null {
  if (!message.attachments.length) {
    return null;
  }
  const first = message.attachments[0];
  if (!first) {
    return null;
  }
  if (first.mediaType?.startsWith("image/")) {
    return "Shared an image";
  }
  if (first.mediaType?.startsWith("video/")) {
    return "Shared a video";
  }
  return "Shared an attachment";
}

function buildMessageSnippet(message: ChatMessage): string | null {
  const bodySnippet = truncateSnippet(message.body ?? null);
  if (bodySnippet) {
    return bodySnippet;
  }
  return attachmentSummary(message);
}

export function useChatRoster(): UseChatRosterResult {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [entries, setEntries] = useState<ChatRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const unreadCountsRef = useRef<Record<string, number>>(getUnreadCounts());

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
      const unreadSnapshot = unreadCountsRef.current;
      setEntries((prev) => {
        const prevMap = new Map(prev.map((entry) => [entry.peerId, entry]));
        const mapped = friends
          .filter((row) => row.friend_id && row.status === "accepted")
          .map<ChatRosterEntry>((row) => ({
            peerId: row.friend_id,
            displayName: row.friend_display_name?.trim() || "Friend",
            handle: row.friend_handle ?? null,
            avatarUrl: null,
            isDemo: false,
            lastMessageSnippet: prevMap.get(row.friend_id)?.lastMessageSnippet ?? null,
            lastMessageAt: prevMap.get(row.friend_id)?.lastMessageAt ?? null,
            unreadCount: unreadSnapshot[row.friend_id] ?? 0,
          }));
        return sortRoster(mapped);
      });
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

  useEffect(() => {
    if (!userId || !campusId) {
      return;
    }
    initChatSocket(SOCKET_BASE_URL, userId, campusId);
    bindChatUnreadSocket(SOCKET_BASE_URL, userId, campusId);
    const unsubscribe = onMessage((message) => {
      const peerId = message.senderId === userId ? message.recipientId : message.senderId;
      if (!peerId) {
        return;
      }
      const isIncoming = message.senderId !== userId;
      if (isIncoming) {
        markPresenceFromActivity(peerId, { lastSeen: message.createdAt ?? new Date().toISOString() });
      }
      const snippet = buildMessageSnippet(message);
      const createdAt = message.createdAt ?? new Date().toISOString();
      setEntries((prev) => {
        let found = false;
        const next = prev.map((entry) => {
          if (entry.peerId !== peerId) {
            return entry;
          }
          found = true;
          return {
            ...entry,
            lastMessageSnippet: snippet ?? entry.lastMessageSnippet ?? null,
            lastMessageAt: createdAt,
            unreadCount: unreadCountsRef.current[peerId] ?? 0,
          };
        });
        if (!found) {
          next.push({
            peerId,
            displayName: isIncoming ? "New conversation" : peerId.slice(0, 12),
            handle: null,
            avatarUrl: null,
            isDemo: false,
            lastMessageSnippet: snippet ?? null,
            lastMessageAt: createdAt,
            unreadCount: unreadCountsRef.current[peerId] ?? 0,
          });
        }
        return sortRoster(next);
      });
    });
    return () => {
      unsubscribe();
    };
  }, [userId, campusId]);

  useEffect(() => {
    return subscribeUnreadCounts((nextCounts) => {
      unreadCountsRef.current = nextCounts;
      setEntries((prev) =>
        sortRoster(
          prev.map((entry) => ({
            ...entry,
            unreadCount: nextCounts[entry.peerId] ?? 0,
          })),
        ),
      );
    });
  }, []);

  const setActiveConversation = useCallback((peerId: string | null) => {
    activeConversationRef.current = peerId;
    setActiveChatPeer(peerId);
    if (!peerId) {
      return;
    }
    acknowledgeConversation(peerId);
    setEntries((prev) =>
      prev.map((entry) =>
        entry.peerId === peerId
          ? {
              ...entry,
              unreadCount: 0,
            }
          : entry,
      ),
    );
  }, []);

  const updateConversationSnapshot = useCallback((peerId: string, message: ChatMessage | null) => {
    if (!message) {
      return;
    }
    const snippet = buildMessageSnippet(message);
    const createdAt = message.createdAt ?? new Date().toISOString();
    setEntries((prev) =>
      sortRoster(
        prev.map((entry) =>
          entry.peerId === peerId
            ? {
                ...entry,
                lastMessageSnippet: snippet ?? entry.lastMessageSnippet ?? null,
                lastMessageAt: createdAt,
              }
            : entry,
        ),
      ),
    );
  }, []);

  return useMemo(
    () => ({
      entries,
      loading,
      error,
      refresh,
      authUser,
      setActiveConversation,
      updateConversationSnapshot,
    }),
    [entries, loading, error, refresh, authUser, setActiveConversation, updateConversationSnapshot],
  );
}
