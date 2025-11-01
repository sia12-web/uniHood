"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchPresence } from "@/lib/presence";
import { hydratePresence, usePresenceStore, type PresenceStatus } from "@/store/presence";

function stableIds(userIds: string[]): string[] {
  return Array.from(new Set(userIds.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function usePresence(userIds: string[]) {
  const ids = useMemo(() => stableIds(userIds), [userIds]);
  const key = useMemo(() => ids.join(",") || "none", [ids]);

  const query = useQuery({
    queryKey: ["presence:users", key],
    queryFn: async () => {
      if (ids.length === 0) {
        return [] as [];
      }
      const records = await fetchPresence(ids);
      hydratePresence(records);
      return records;
    },
    enabled: ids.length > 0,
    staleTime: 15_000,
  });

  const presence = usePresenceStore(
    useCallback(
      (state) =>
        ids.reduce<Record<string, PresenceStatus | null>>((acc, id) => {
          acc[id] = state.users[id] ?? null;
          return acc;
        }, {}),
      [ids],
    ),
  );

  return {
    presence,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function usePresenceForUser(userId: string | null | undefined) {
  const { presence } = usePresence(userId ? [userId] : []);
  return userId ? presence[userId] ?? null : null;
}
