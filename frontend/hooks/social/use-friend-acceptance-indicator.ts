"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { fetchInviteOutbox } from "@/lib/social";
import { getSocialSocket } from "@/lib/socket";

const STORAGE_KEY_PREFIX = "friends:accepted-notification";

function storageKeyFor(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export type FriendAcceptanceIndicator = {
  hasNotification: boolean;
  latestFriendPeerId: string | null;
  acknowledge: () => void;
  isLoading: boolean;
  authUser: AuthUser | null;
};

type StoredIndicator = {
  peerId?: string | null;
  at?: number;
};

export function useFriendAcceptanceIndicator(): FriendAcceptanceIndicator {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hasNotification, setHasNotification] = useState(false);
  const [sentInviteIds, setSentInviteIds] = useState<Set<string>>(new Set());
  const sentInvitePeersRef = useRef<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [latestFriendPeerId, setLatestFriendPeerId] = useState<string | null>(null);

  useEffect(() => {
    setAuthUser(readAuthUser());
    const unsubscribe = onAuthChange(() => {
      setAuthUser(readAuthUser());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser?.userId || typeof window === "undefined") {
      setLoading(false);
      return undefined;
    }

    const storageKey = storageKeyFor(authUser.userId);
    const persisted = window.sessionStorage.getItem(storageKey);
    if (persisted) {
      try {
        const parsed = JSON.parse(persisted) as StoredIndicator;
        setHasNotification(true);
        setLatestFriendPeerId(typeof parsed.peerId === "string" ? parsed.peerId : null);
      } catch {
        setHasNotification(true);
        setLatestFriendPeerId(null);
      }
    } else {
      setHasNotification(false);
      setLatestFriendPeerId(null);
    }

    let active = true;
    setLoading(true);
    fetchInviteOutbox(authUser.userId, authUser.campusId ?? null)
      .then((outbox) => {
        if (!active) {
          return;
        }
        const nextIds = new Set<string>();
        const peerMap = new Map<string, string>();
        outbox.forEach((invite) => {
          nextIds.add(invite.id);
          if (invite.to_user_id) {
            peerMap.set(invite.id, invite.to_user_id);
          }
        });
        sentInvitePeersRef.current = peerMap;
        setSentInviteIds(nextIds);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setSentInviteIds(new Set());
        sentInvitePeersRef.current = new Map();
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const socket = getSocialSocket(authUser.userId, authUser.campusId ?? null);
    const persistNotification = (peerId: string | null) => {
      if (!authUser?.userId || typeof window === "undefined") {
        return;
      }
      const payload: StoredIndicator = {
        peerId,
        at: Date.now(),
      };
      window.sessionStorage.setItem(storageKeyFor(authUser.userId), JSON.stringify(payload));
      setLatestFriendPeerId(peerId);
      setHasNotification(true);
    };
    const handleInviteUpdate = (payload: { id?: string; status?: string }) => {
      if (!payload?.id || payload.status !== "accepted") {
        return;
      }
      setSentInviteIds((prev) => {
        if (!prev.has(payload.id!)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(payload.id!);
        return next;
      });
      const peerId = sentInvitePeersRef.current.get(payload.id!) ?? null;
      sentInvitePeersRef.current.delete(payload.id!);
      persistNotification(peerId);
    };

    socket.on("invite:update", handleInviteUpdate);
    socket.emit("subscribe_self");

    return () => {
      active = false;
      socket.off("invite:update", handleInviteUpdate);
    };
  }, [authUser]);

  const acknowledge = useCallback(() => {
    if (!authUser?.userId || typeof window === "undefined") {
      return;
    }
    window.sessionStorage.removeItem(storageKeyFor(authUser.userId));
    setHasNotification(false);
    setLatestFriendPeerId(null);
  }, [authUser]);

  return useMemo(
    () => ({
      hasNotification,
      latestFriendPeerId,
      acknowledge,
      isLoading: loading,
      authUser,
    }),
    [acknowledge, authUser, hasNotification, latestFriendPeerId, loading],
  );
}
