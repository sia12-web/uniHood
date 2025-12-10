"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listTicTacToeSessions } from "@/app/features/activities/api/client";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoUserId } from "@/lib/env";

export type TicTacToeInvite = {
  sessionId: string;
  opponentUserId: string;
};

type Options = {
  peerUserId?: string;
};

const POLL_INTERVAL_MS = 5_000;

export function useTicTacToeInvite(options?: Options) {
  const [invite, setInvite] = useState<TicTacToeInvite | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const activeInviteIdRef = useRef<string | null>(null);
  const selfIdRef = useRef<string>("");

  useEffect(() => {
    const user = readAuthUser();
    selfIdRef.current = user?.userId || getDemoUserId();

    // Sync handled IDs from localStorage
    try {
      const stored = localStorage.getItem("tictactoe_invites_handled");
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
      localStorage.setItem("tictactoe_invites_handled", JSON.stringify(ids));
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

    let timer: NodeJS.Timeout;
    let active = true;

    async function poll() {
      try {
        const sessions = await listTicTacToeSessions("pending");
        if (!active) return;

        // Find a session where we are a participant but NOT the creator
        // And we haven't handled it yet
        const incoming = sessions.find((s) => {
          if (handledRef.current.has(s.id)) return false;
          if (s.creatorUserId === userId) return false; // We created it
          
          // Check if we are in participants
          const amParticipant = s.participants.some(p => p.userId === userId);
          if (!amParticipant) return false;

          // If peerUserId is specified, filter by creator
          if (options?.peerUserId && s.creatorUserId !== options.peerUserId) {
            return false;
          }

          return true;
        });

        if (incoming) {
          if (activeInviteIdRef.current !== incoming.id) {
            activeInviteIdRef.current = incoming.id;
            setInvite({
              sessionId: incoming.id,
              opponentUserId: incoming.creatorUserId,
            });
          }
        } else {
          // No pending invites
          if (activeInviteIdRef.current) {
            activeInviteIdRef.current = null;
            setInvite(null);
          }
        }
      } catch (err) {
        // silent fail on poll
        console.error("Failed to poll tictactoe invites", err);
      } finally {
        if (active) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    void poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [options?.peerUserId]);

  return { invite, acknowledge };
}
