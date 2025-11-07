"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { fetchInviteInbox, fetchInviteOutbox } from "@/lib/social";
import { getSocialSocket } from "@/lib/socket";
import type { InviteSummary } from "@/lib/types";

export const INVITE_REFRESH_EVENT = "divan:invites:refresh";

export type InviteCountSnapshot = {
  inboundPending: number;
  outboundPending: number;
  pendingCount: number;
  isLoading: boolean;
};

const defaultSnapshot: InviteCountSnapshot = {
  inboundPending: 0,
  outboundPending: 0,
  pendingCount: 0,
  isLoading: false,
};

export function emitInviteCountRefresh(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(INVITE_REFRESH_EVENT));
}

function countPending(entries: InviteSummary[] | null | undefined): number {
  if (!entries?.length) {
    return 0;
  }
  return entries.reduce((total, invite) => (invite.status === "sent" ? total + 1 : total), 0);
}

export function useInviteInboxCount(): InviteCountSnapshot {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<InviteCountSnapshot>(defaultSnapshot);
  const loadingRef = useRef(false);

  const loadCounts = useCallback(
    async (userId: string, campusId: string | null) => {
      if (loadingRef.current) {
        return;
      }
      loadingRef.current = true;
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const [inbox, outbox] = await Promise.all([
          fetchInviteInbox(userId, campusId ?? null),
          fetchInviteOutbox(userId, campusId ?? null),
        ]);
        const inboundPending = countPending(inbox);
        const outboundPending = countPending(outbox);
        setState({
          inboundPending,
          outboundPending,
          pendingCount: inboundPending,
          isLoading: false,
        });
      } catch {
        setState({ ...defaultSnapshot, isLoading: false });
      } finally {
        loadingRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    setAuthUser(readAuthUser());
    const unsubscribe = onAuthChange(() => {
      setAuthUser(readAuthUser());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser?.userId) {
      setState(defaultSnapshot);
      return;
    }
    let cancelled = false;
    (async () => {
      await loadCounts(authUser.userId, authUser.campusId ?? null);
      if (cancelled) {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.campusId, authUser?.userId, loadCounts]);

  useEffect(() => {
    if (!authUser?.userId) {
      return;
    }
    const socket = getSocialSocket(authUser.userId, authUser.campusId ?? null);
    const refresh = () => {
      void loadCounts(authUser.userId, authUser.campusId ?? null);
    };
    socket.on("invite:new", refresh);
    socket.on("invite:update", refresh);
    socket.emit("subscribe_self");
    return () => {
      socket.off("invite:new", refresh);
      socket.off("invite:update", refresh);
    };
  }, [authUser?.campusId, authUser?.userId, loadCounts]);

  useEffect(() => {
    if (!authUser?.userId || typeof window === "undefined") {
      return;
    }
    const handler = () => {
      void loadCounts(authUser.userId, authUser.campusId ?? null);
    };
    window.addEventListener(INVITE_REFRESH_EVENT, handler);
    return () => {
      window.removeEventListener(INVITE_REFRESH_EVENT, handler);
    };
  }, [authUser?.campusId, authUser?.userId, loadCounts]);

  return useMemo(() => state, [state]);
}
