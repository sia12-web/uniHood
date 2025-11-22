import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  assignStoryRole,
  getActivity,
  getSelf,
  submitStoryTurn,
  type ActivityDetail,
} from "../api/client";
import { useActivitySocket } from "./useActivitySocket";

export type StorySessionState = {
  activity: ActivityDetail | null;
  loading: boolean;
  error: string | null;
  role: "boy" | "girl" | null;
  scenario: string | null;
  lines: Array<{ user_id: string; content: string; idx: number }>;
  currentTurn: {
    idx: number;
    who: "boy" | "girl";
    deadline: number | null;
    isMyTurn: boolean;
  } | null;
};

export function useStorySession() {
  const searchParams = useSearchParams();
  const activityId = searchParams?.get("id");
  const [state, setState] = useState<StorySessionState>({
    activity: null,
    loading: true,
    error: null,
    role: null,
    scenario: null,
    lines: [],
    currentTurn: null,
  });

  const selfId = getSelf();

  const handleUpdate = useCallback((data: ActivityDetail) => {
    setState((prev) => {
      const meta = data.meta || {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storyMeta = (meta.story as any) || {};
      const roles = storyMeta.roles || {};
      const myRole = roles[selfId] || null;
      const scenario = storyMeta.scenario || null;
      const lines = storyMeta.lines || [];
      
      // Determine current turn
      let currentTurn = null;
      const openRound = data.rounds.find(r => r.state === "open");
      if (openRound) {
        const turnIdx = openRound.idx;
        // Odd = Boy, Even = Girl
        const who: "boy" | "girl" = turnIdx % 2 !== 0 ? "boy" : "girl";
        const isMyTurn = myRole === who;
        // Calculate deadline if needed
        currentTurn = {
          idx: turnIdx,
          who,
          deadline: null, // TODO: Parse from round meta or timer
          isMyTurn,
        };
      }

      return {
        ...prev,
        activity: data,
        loading: false,
        role: myRole,
        scenario,
        lines,
        currentTurn,
      };
    });
  }, [selfId]);

  const refresh = useCallback(async () => {
    if (!activityId) return;
    try {
      const data = await getActivity(activityId);
      handleUpdate(data);
    } catch {
      setState(prev => ({ ...prev, loading: false, error: "Failed to load activity" }));
    }
  }, [activityId, handleUpdate]);

  useActivitySocket(activityId, refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const joinRole = async (role: "boy" | "girl") => {
    if (!activityId) return;
    try {
      const updated = await assignStoryRole(activityId, role);
      handleUpdate(updated as ActivityDetail);
    } catch (err) {
      console.error("Failed to join role", err);
    }
  };

  const submitTurn = async (content: string) => {
    if (!activityId) return;
    try {
      const updated = await submitStoryTurn(activityId, content);
      handleUpdate(updated as ActivityDetail);
    } catch (err) {
      console.error("Failed to submit turn", err);
    }
  };

  return {
    ...state,
    joinRole,
    submitTurn,
  };
}
