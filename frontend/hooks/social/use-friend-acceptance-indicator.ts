"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { fetchInviteOutbox } from "@/lib/social";
import { getSocialSocket } from "@/lib/socket";

const STORAGE_KEY_PREFIX = "friends:accepted-notification";

function storageKeyFor(userId: string) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export type FriendAcceptanceIndicator = {
  hasNotification: boolean;
  acknowledge: () => void;
  isLoading: boolean;
  authUser: AuthUser | null;
};

export function useFriendAcceptanceIndicator(): FriendAcceptanceIndicator {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hasNotification, setHasNotification] = useState(false);
  const [sentInviteIds, setSentInviteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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
    if (persisted === "1") {
      setHasNotification(true);
    } else {
      setHasNotification(false);
    }

    let active = true;
    setLoading(true);
    fetchInviteOutbox(authUser.userId, authUser.campusId ?? null)
      .then((outbox) => {
        if (!active) {
          return;
        }
        const nextIds = new Set<string>();
        outbox.forEach((invite) => nextIds.add(invite.id));
        setSentInviteIds(nextIds);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setSentInviteIds(new Set());
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const socket = getSocialSocket(authUser.userId, authUser.campusId ?? null);
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
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(storageKey, "1");
        }
        setHasNotification(true);
        return next;
      });
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
  }, [authUser]);

  return useMemo(
    () => ({
      hasNotification,
      acknowledge,
      isLoading: loading,
      authUser,
    }),
    [acknowledge, authUser, hasNotification, loading],
  );
}
