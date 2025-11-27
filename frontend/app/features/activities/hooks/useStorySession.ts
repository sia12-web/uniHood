import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  assignStoryRole,
  getActivity,
  getSelf,
  setStoryReady,
  startActivity,
  submitStoryTurn,
  scoreStoryLine,
  type ActivityDetail,
} from "../api/client";
import { useActivitySocket } from "./useActivitySocket";

type StoryMeta = {
  roles?: Record<string, string>;
  scenario?: string | null;
  lines?: Array<{ userId: string; content: string; roundIdx: number; score?: number }>;
  winner?: "boy" | "girl" | "tie" | null;
  ready?: Record<string, boolean>;
};

export type StorySessionState = {
  activity: ActivityDetail | null;
  loading: boolean;
  error: string | null;
  role: "boy" | "girl" | null;
  scenario: string | null;
  lines: Array<{ userId: string; content: string; roundIdx: number; score?: number }>;
  winner: "boy" | "girl" | "tie" | null;
  currentTurn: {
    idx: number;
    who: "boy" | "girl";
    deadline: number | null;
    isMyTurn: boolean;
  } | null;
  ready: {
    me: boolean;
    partner: boolean;
  };
  partnerId: string | null;
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
    winner: null,
    currentTurn: null,
    ready: { me: false, partner: false },
    partnerId: null,
  });

  const selfId = getSelf();
  const [starting, setStarting] = useState(false);

  const handleUpdate = useCallback((data: ActivityDetail) => {
    setState((prev) => {
      const meta = data.meta || {};
      const storyMeta = (meta.story as StoryMeta | undefined) ?? {};
      const roles = storyMeta.roles || {};
      const readyMap = storyMeta.ready || {};
      const partnerId = data.user_a === selfId ? data.user_b : data.user_a;
      const myReady = Boolean(readyMap[selfId]);
      const partnerReady = partnerId ? Boolean(readyMap[partnerId]) : false;
      const roleValue = roles[selfId];
      const myRole: "boy" | "girl" | null = roleValue === "boy" || roleValue === "girl" ? roleValue : null;
      const scenario = storyMeta.scenario || null;
      const lines = storyMeta.lines || [];
      const winner = storyMeta.winner || null;
      
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
        winner,
        currentTurn,
        ready: {
          me: myReady,
          partner: partnerReady,
        },
        partnerId,
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

  // Safety net: if both roles are filled but the activity is still in the lobby,
  // trigger start so the scenario and rounds become available.
  useEffect(() => {
    const activity = state.activity;
    if (!activity || starting) return;
    const storyMeta = ((activity.meta as { story?: StoryMeta } | undefined)?.story) ?? {};
    const roleValues: string[] = Object.values(storyMeta.roles || {});
    const hasBoy = roleValues.includes("boy");
    const hasGirl = roleValues.includes("girl");
    if (activity.state === "lobby" && hasBoy && hasGirl) {
      setStarting(true);
      void startActivity(activity.id)
        .then(() => refresh())
        .catch((err) => {
          console.error("Failed to auto-start story", err);
        })
        .finally(() => setStarting(false));
    }
  }, [refresh, starting, state.activity]);

  useActivitySocket(activityId, refresh);

  // Poll while waiting so both peers see state changes even without sockets.
  useEffect(() => {
    if (!activityId) return;
    const shouldPoll =
      state.loading ||
      state.activity?.state === "lobby" ||
      !state.scenario ||
      !state.currentTurn;
    if (!shouldPoll) return;
    const id = setInterval(() => {
      void refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [activityId, refresh, state.activity?.state, state.currentTurn, state.loading, state.scenario]);

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

  const setReady = async (ready: boolean) => {
    if (!activityId) return;
    try {
      const updated = await setStoryReady(activityId, ready);
      handleUpdate(updated as ActivityDetail);
    } catch (err) {
      console.error("Failed to update ready state", err);
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

  const scoreLine = async (roundIdx: number, score: number) => {
    if (!activityId) return;
    try {
      const updated = await scoreStoryLine(activityId, roundIdx, score);
      handleUpdate(updated as ActivityDetail);
    } catch (err) {
      console.error("Failed to score line", err);
    }
  };

  return {
    ...state,
    joinRole,
    setReady,
    submitTurn,
    scoreLine,
  };
}
