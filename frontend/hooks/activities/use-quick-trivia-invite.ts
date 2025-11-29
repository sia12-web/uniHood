"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getSelf, listQuickTriviaSessions, type QuickTriviaLobbySummary } from "@/app/features/activities/api/client";

export type QuickTriviaInvite = {
  sessionId: string;
  opponentUserId: string;
};

type Options = {
  peerUserId?: string;
};

const POLL_INTERVAL_MS = 5_000;

function pickOpponent(summary: QuickTriviaLobbySummary, selfId: string): string | null {
  const participant = summary.participants.find((entry) => entry.userId !== selfId);
  return participant ? participant.userId : null;
}

export function useQuickTriviaInvite(options?: Options) {
  const [invite, setInvite] = useState<QuickTriviaInvite | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const activeInviteIdRef = useRef<string | null>(null);
  const selfIdRef = useRef<string>(getSelf());

  useEffect(() => {
    selfIdRef.current = getSelf();
  }, []);

  const acknowledge = useCallback((sessionId: string) => {
    handledRef.current.add(sessionId);
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
    const selfId = getSelf();

    // Don't poll if not authenticated
    if (!selfId || selfId === 'anonymous-user') {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let endpointNotFound = false;

    const poll = async () => {
      if (cancelled || endpointNotFound) {
        return;
      }

      try {
        const summaries = await listQuickTriviaSessions("pending");
        if (cancelled) {
          return;
        }

        const selfId = selfIdRef.current;
        const next = summaries.find((summary) => {
          if (summary.activityKey !== "quick_trivia") return false;
          if (summary.creatorUserId === selfId) return false;
          if (!summary.participants.some((entry) => entry.userId === selfId)) return false;
          const opponentId = pickOpponent(summary, selfId);
          if (!opponentId) return false;
          if (options?.peerUserId && opponentId !== options.peerUserId) return false;
          if (handledRef.current.has(summary.id)) return false;
          return true;
        });

        if (!next) {
          activeInviteIdRef.current = null;
          setInvite(null);
        } else if (activeInviteIdRef.current !== next.id) {
          const opponentUserId = pickOpponent(next, selfId);
          if (opponentUserId) {
            activeInviteIdRef.current = next.id;
            setInvite({ sessionId: next.id, opponentUserId });
          }
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('404') || errorMessage.includes('not found')) {
            endpointNotFound = true;
            console.info("quick_trivia_invite_endpoint_not_available", "Stopped polling");
            return;
          }
          console.warn("quick_trivia_invite_poll_failed", error);
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
