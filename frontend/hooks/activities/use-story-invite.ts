"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSelf, listStoryBuilderSessions, type StoryBuilderLobbySummary } from "@/app/features/activities/api/client";

export type StoryInvite = {
  id: string;
  /** The userId of the opponent (person who created the session) */
  opponentUserId: string;
  /** Alias for opponentUserId kept for backwards compatibility */
  user_a: string;
};

type Options = {
  peerUserId?: string;
};

const POLL_INTERVAL_MS = 5_000;

function pickOpponent(summary: StoryBuilderLobbySummary, selfId: string): string | null {
  // The creator invited us, so they are the opponent
  if (summary.creatorUserId !== selfId) {
    return summary.creatorUserId;
  }
  // Fallback: pick someone else in participants
  const other = summary.participants.find((p) => p.userId !== selfId);
  return other ? other.userId : null;
}

export function useStoryInvite(options?: Options) {
  const [invite, setInvite] = useState<StoryInvite | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const activeInviteIdRef = useRef<string | null>(null);
  const selfIdRef = useRef<string>(getSelf());

  useEffect(() => {
    selfIdRef.current = getSelf();
  }, []);

  const clearInvite = useCallback((sessionId: string) => {
    handledRef.current.add(sessionId);

    // Persist to localStorage so we don't reshow the same invite on reload.
    try {
      const ids = Array.from(handledRef.current);
      localStorage.setItem("story_invites_handled", JSON.stringify(ids));
    } catch {
      // ignore storage failures
    }

    if (activeInviteIdRef.current === sessionId) {
      activeInviteIdRef.current = null;
      setInvite(null);
    }
  }, []);

  const acknowledge = useCallback((sessionId: string) => {
    clearInvite(sessionId);
  }, [clearInvite]);

  const dismiss = useCallback((sessionId: string) => {
    clearInvite(sessionId);
  }, [clearInvite]);

  // Reset on peerUserId change (like other activity hooks)
  useEffect(() => {
    handledRef.current.clear();
    activeInviteIdRef.current = null;
    setInvite(null);
  }, [options?.peerUserId]);

  useEffect(() => {
    const selfId = getSelf();

    // Don't poll if not authenticated
    if (!selfId || selfId === "anonymous-user") {
      return;
    }

    // Sync handled IDs from localStorage
    try {
      const stored = localStorage.getItem("story_invites_handled");
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          ids.forEach((id) => handledRef.current.add(id));
        }
      }
    } catch {
      // ignore
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let endpointNotFound = false;

    const poll = async () => {
      if (cancelled || endpointNotFound) {
        return;
      }

      try {
        const summaries = await listStoryBuilderSessions("pending");
        if (cancelled) {
          return;
        }

        const selfId = selfIdRef.current;

        // Find a pending story_builder session where:
        // 1. I am NOT the creator (so I didn't invite myself)
        // 2. I AM in the participants list (I was invited)
        // 3. Not already handled/dismissed
        // 4. Has enough participants (at least 2)
        const next = summaries.find((summary) => {
          if (summary.activityKey !== "story_builder") return false;
          if (summary.creatorUserId === selfId) return false; // Don't show invite to creator
          if (!summary.participants.some((p) => p.userId === selfId)) return false; // Must be invited
          if (handledRef.current.has(summary.id)) return false;
          if (summary.participants.length < 2) return false; // Must have at least 2 participants
          const opponentId = pickOpponent(summary, selfId);
          if (!opponentId) return false;
          if (options?.peerUserId && opponentId !== options.peerUserId) return false;

          // Filter out stale sessions (> 30 mins old)
          if (summary.createdAt) {
             const age = Date.now() - summary.createdAt;
             if (age > 30 * 60 * 1000) return false;
          }

          return true;
        });

        if (!next) {
          activeInviteIdRef.current = null;
          setInvite(null);
        } else if (activeInviteIdRef.current !== next.id) {
          const opponentUserId = pickOpponent(next, selfId);
          if (opponentUserId) {
            activeInviteIdRef.current = next.id;
            setInvite({ id: next.id, opponentUserId, user_a: opponentUserId });
          }
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("404") || errorMessage.includes("not found")) {
            endpointNotFound = true;
            console.info("story_invite_endpoint_not_available", "Stopped polling");
            return;
          }
          console.warn("story_invite_poll_failed", error);
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
    () => ({ invite, acknowledge, dismiss }),
    [acknowledge, dismiss, invite]
  );
}
