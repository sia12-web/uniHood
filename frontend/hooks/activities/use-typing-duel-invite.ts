"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listSpeedTypingSessions } from "@/app/features/activities/api/client";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoUserId } from "@/lib/env";

export type TypingDuelInvite = {
  sessionId: string;
  opponentUserId: string;
};

type Options = {
  peerUserId?: string;
};

const POLL_INTERVAL_MS = 5_000;

export function useTypingDuelInvite(options?: Options) {
  const [invite, setInvite] = useState<TypingDuelInvite | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const activeInviteIdRef = useRef<string | null>(null);
  const selfIdRef = useRef<string>("");

  useEffect(() => {
    const user = readAuthUser();
    selfIdRef.current = user?.userId || getDemoUserId();

    // Sync handled IDs from localStorage
    try {
      const stored = localStorage.getItem("typing_duel_invites_handled");
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          ids.forEach((id) => handledRef.current.add(id));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const acknowledge = useCallback((sessionId: string) => {
    handledRef.current.add(sessionId);

    // Persist to localStorage
    try {
      const ids = Array.from(handledRef.current);
      localStorage.setItem("typing_duel_invites_handled", JSON.stringify(ids));
    } catch {
      // ignore
    }

    if (activeInviteIdRef.current === sessionId) {
      activeInviteIdRef.current = null;
      setInvite(null);
    }
  }, []);

  useEffect(() => {
    handledRef.current.clear();
    activeInviteIdRef.current = null;
    setInvite(null);
  }, [options?.peerUserId]);

  useEffect(() => {
    const user = readAuthUser();
    const userId = user?.userId || getDemoUserId();

    // Don't poll if not authenticated
    if (!userId) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let endpointNotFound = false; // Track if endpoint returns 404

    const poll = async () => {
      if (cancelled || endpointNotFound) {
        return;
      }

      try {
        const sessions = await listSpeedTypingSessions("pending");
        if (cancelled) {
          return;
        }

        const selfId = selfIdRef.current;
        const next = sessions.find((session) => {
          if (session.status !== "pending") {
            return false;
          }

          const participants = session.participants ?? [];
          const isParticipant = participants.some((entry) => entry.userId === selfId);
          if (!isParticipant) {
            return false;
          }

          // Creator can't invite themselves; treat any session they created as already acknowledged
          if (session.creatorUserId === selfId) {
            return false;
          }

          const opponentEntry = participants.find((entry) => entry.userId !== selfId);
          const opponentId = opponentEntry?.userId ?? session.creatorUserId;

          if (options?.peerUserId && opponentId !== options.peerUserId) {
            return false;
          }

          if (handledRef.current.has(session.id)) {
            return false;
          }

          // Filter out stale sessions (> 30 mins old)
          if (session.createdAt) {
             const age = Date.now() - session.createdAt;
             if (age > 30 * 60 * 1000) return false;
          }

          return true;
        });

        if (!next) {
          activeInviteIdRef.current = null;
          setInvite(null);
        } else if (activeInviteIdRef.current !== next.id) {
          const participants = next.participants ?? [];
          const opponentEntry = participants.find((entry) => entry.userId !== selfIdRef.current);
          const opponentUserId = opponentEntry?.userId ?? next.creatorUserId;
          activeInviteIdRef.current = next.id;
          setInvite({ sessionId: next.id, opponentUserId });
        }
      } catch (error) {
        if (!cancelled) {
          // Check if it's a 404 error (endpoint doesn't exist)
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('404') || errorMessage.includes('not found')) {
            endpointNotFound = true;
            console.info("typing_duel_invite_endpoint_not_available", "Stopped polling");
            return; // Stop polling
          }
          console.warn("typing_duel_invite_poll_failed", error);
        }
      } finally {
        if (!cancelled && !endpointNotFound) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [options?.peerUserId]);

  return useMemo(
    () => ({
      invite,
      acknowledge,
    }),
    [acknowledge, invite],
  );
}
