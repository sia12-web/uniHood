"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMySummary } from "@/lib/leaderboards";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { readAuthUser } from "@/lib/auth-storage";

type MyPointsState = {
  loading: boolean;
  totalPoints: number | null;
  error: string | null;
};

/**
 * Hook to fetch the current user's total leaderboard points.
 * Returns loading state, total points, and any error.
 */
export function useMyPoints() {
  const [state, setState] = useState<MyPointsState>({
    loading: true,
    totalPoints: null,
    error: null,
  });

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const authUser = readAuthUser();
    const userId = authUser?.userId ?? getDemoUserId();
    const campusId = authUser?.campusId ?? getDemoCampusId();

    if (!userId) {
      setState({ loading: false, totalPoints: null, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const summary = await fetchMySummary({ userId, campusId, signal });
      const points = summary?.scores?.overall ?? 0;
      setState({ loading: false, totalPoints: points, error: null });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setState({
        loading: false,
        totalPoints: null,
        error: err instanceof Error ? err.message : "Failed to load points",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return {
    loading: state.loading,
    totalPoints: state.totalPoints,
    error: state.error,
    refresh,
  };
}
