"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listActivities, type ActivitySummary } from "@/lib/activities";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoUserId } from "@/lib/env";

export type StoryInvite = {
  id: string;
  user_a: string;
};

const POLL_INTERVAL_MS = 5_000;

export function useStoryInvite() {
  const [invite, setInvite] = useState<StoryInvite | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const activeInviteIdRef = useRef<string | null>(null);

  // Sync from storage helper
  const syncHandled = () => {
    try {
      const stored = localStorage.getItem("story_invites_handled");
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          ids.forEach(id => handledRef.current.add(id));
        }
      }
    } catch (e) {
      // ignore
    }
  };

  // Initial sync
  useEffect(() => {
    syncHandled();
  }, []);

  const clearInvite = useCallback((activityId: string) => {
    handledRef.current.add(activityId);

    // Persist to localStorage so we don't reshow the same invite on reload.
    try {
      const ids = Array.from(handledRef.current);
      localStorage.setItem("story_invites_handled", JSON.stringify(ids));
    } catch {
      // ignore storage failures
    }

    if (activeInviteIdRef.current === activityId) {
      activeInviteIdRef.current = null;
      setInvite(null);
    }
  }, []);

  const acknowledge = useCallback((activityId: string) => {
    clearInvite(activityId);
  }, [clearInvite]);

  const dismiss = useCallback((activityId: string) => {
    clearInvite(activityId);
  }, [clearInvite]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const user = readAuthUser();
        const userId = user?.userId || getDemoUserId();
        if (!userId) return;

        const activities = await listActivities();
        if (!active) return;

        // Sync handled list before filtering to ensure we have latest
        syncHandled();

        // If the active invite's session ID is already marked handled (another tab or a race),
        // clear the notification so it doesn't stay stuck.
        if (activeInviteIdRef.current && handledRef.current.has(activeInviteIdRef.current)) {
          activeInviteIdRef.current = null;
          setInvite(null);
        }

        // Find pending story invites where I am user_b
        const storyInvites = activities.filter(
          (a) =>
            a.kind === "story_alt" &&
            a.state === "lobby" &&
            a.user_b === userId &&
            !handledRef.current.has(a.id)
        );

        if (storyInvites.length > 0) {
          const newest = storyInvites[0];
          if (activeInviteIdRef.current !== newest.id) {
            activeInviteIdRef.current = newest.id;
            setInvite({ id: newest.id, user_a: newest.user_a });
          }
        } else {
          if (activeInviteIdRef.current) {
            activeInviteIdRef.current = null;
            setInvite(null);
          }
        }
      } catch (err) {
        console.error("Failed to poll story invites", err);
      }
    };

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return { invite, acknowledge, dismiss };
}
