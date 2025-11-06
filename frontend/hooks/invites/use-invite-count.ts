"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { AuthUser } from "@/lib/auth-storage";
import { fetchInviteInbox } from "@/lib/social";
import { getDemoCampusId } from "@/lib/env";
import { getSocialSocket } from "@/lib/socket";

const DEMO_CAMPUS_ID = getDemoCampusId();

function getQueryKey(userId: string, campusId: string | null) {
  return ["invites", "inbox-count", userId, campusId ?? "none"] as const;
}

export function useInviteInboxCount(authUser: AuthUser | null) {
  const userId = authUser?.userId ?? null;
  const campusId = authUser?.campusId ?? DEMO_CAMPUS_ID;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: userId ? getQueryKey(userId, campusId) : ["invites", "inbox-count", "anonymous"],
    queryFn: async () => {
      if (!userId) {
        return 0;
      }
      try {
        const inbox = await fetchInviteInbox(userId, campusId);
        return inbox.length;
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("invite inbox count fetch failed", error);
        }
        return 0;
      }
    },
    enabled: Boolean(userId),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!userId) {
      return undefined;
    }
    const socket = getSocialSocket(userId, campusId);
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(userId, campusId) });
    };
    socket.on("invite:new", refresh);
    socket.on("invite:update", refresh);
    socket.emit("subscribe_self");
    return () => {
      socket.off("invite:new", refresh);
      socket.off("invite:update", refresh);
    };
  }, [campusId, queryClient, userId]);

  return {
    pendingCount: query.data ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
