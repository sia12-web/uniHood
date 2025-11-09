"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import StoryBoard, { StoryLine } from "@/components/StoryBoard";
import {
  ActivitiesSocket,
  ActivityDetail,
  ActivityScorePayload,
  RoundOpenEvent,
  Scoreboard,
  StoryAppendEvent,
  activitiesSocket,
  getActivity,
  normalizeScoreboard,
  submitStory,
  summaryToScoreboard,
} from "@/lib/activities";
import { getDemoUserId } from "@/lib/env";

type Props = { params: { matchId: string } };

const DEMO_USER_ID = getDemoUserId();

function activeRound(detail: ActivityDetail | null) {
  return detail?.rounds.find((round) => round.state === "open");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function computeCountdown(roundMeta: Record<string, unknown> | undefined): number | null {
  if (!roundMeta) {
    return null;
  }
  const closeAt = parseNumber(roundMeta["close_at_ms"]) ?? parseNumber(roundMeta["closeAtMs"]);
  if (!closeAt) {
    return null;
  }
  const remaining = Math.floor((closeAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

function parseStoryLines(detail: ActivityDetail | null): StoryLine[] {
  const detailMeta = detail?.meta;
  const storyMetaSource = isRecord(detailMeta) ? detailMeta["story"] : undefined;
  const storyMeta = isRecord(storyMetaSource) ? storyMetaSource : undefined;
  const rawLines = storyMeta && Array.isArray(storyMeta["lines"]) ? storyMeta["lines"] : [];
  return rawLines
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      idx: parseNumber(entry["idx"]) ?? 0,
      user_id: readString(entry["user_id"]) ?? "",
      content: readString(entry["content"]) ?? "",
    }))
    .filter((line) => line.user_id && line.content)
    .sort((a, b) => a.idx - b.idx);
}

export default function StoryMatchPage({ params }: Props) {
  const { matchId } = params;
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [scoreboard, setScoreboard] = useState<Scoreboard>({ totals: {}, perRound: {}, participants: [] });
  const [storyInput, setStoryInput] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getActivity(matchId);
      setDetail(data);
      setScoreboard(summaryToScoreboard(data));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load story match");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const socket: ActivitiesSocket = activitiesSocket();
    const handleScore = (payload: ActivityScorePayload) => {
      if (payload.activity_id !== matchId) {
        return;
      }
      setScoreboard(normalizeScoreboard(payload));
    };
    const handleStory = (payload: StoryAppendEvent) => {
      if (payload.activity_id !== matchId) {
        return;
      }
      setDetail((prev) => {
        if (!prev) {
          return prev;
        }
        const lines = parseStoryLines(prev);
        const exists = lines.some((line) => line.idx === payload.idx);
        if (!exists) {
          lines.push({ idx: payload.idx, user_id: payload.user_id, content: payload.content });
          lines.sort((a, b) => a.idx - b.idx);
        }
        const nextMeta: Record<string, unknown> = { ...prev.meta };
        const existingStory = isRecord(nextMeta["story"]) ? (nextMeta["story"] as Record<string, unknown>) : {};
        nextMeta["story"] = { ...existingStory, lines };
        return {
          ...prev,
          meta: nextMeta,
        };
      });
    };
    const handleRoundOpen = (payload: RoundOpenEvent) => {
      if (payload.activity_id !== matchId) {
        return;
      }
      void refresh();
    };
    socket.emit("activity_join", { activity_id: matchId });
    socket.on("score:update", handleScore);
    socket.on("story:append", handleStory);
    socket.on("round:open", handleRoundOpen);
    return () => {
      socket.emit("activity_leave", { activity_id: matchId });
      socket.off("score:update", handleScore);
      socket.off("story:append", handleStory);
      socket.off("round:open", handleRoundOpen);
    };
  }, [matchId, refresh]);

  useEffect(() => {
    const roundMetaValue = activeRound(detail)?.meta;
    const meta = isRecord(roundMetaValue) ? roundMetaValue : undefined;
    setTimeRemaining(computeCountdown(meta));
    const closeAt = meta ? parseNumber(meta["close_at_ms"]) ?? parseNumber(meta["closeAtMs"]) : null;
    if (!closeAt) {
      return;
    }
    const interval = window.setInterval(() => {
      setTimeRemaining(computeCountdown(meta));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [detail]);

  const detailMeta = detail?.meta;
  const storyMetaSource = isRecord(detailMeta) ? detailMeta["story"] : undefined;
  const storyMeta = isRecord(storyMetaSource) ? storyMetaSource : {};
  const turns = parseNumber(storyMeta["turns"]) ?? detail?.rounds.length ?? 0;
  const nextTurn = parseNumber(storyMeta["next_turn"]) ?? 1;
  const nextUser = readString(storyMeta["next_user"]);
  const maxChars = parseNumber(storyMeta["max_chars"]) ?? parseNumber(storyMeta["max_chars_per_turn"]) ?? 400;
  const isMyTurn = nextUser === DEMO_USER_ID && detail?.state === "active";
  const lines = useMemo(() => parseStoryLines(detail), [detail]);

  const handleSubmit = useCallback(async () => {
    if (!detail || storyInput.trim().length === 0) {
      return;
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      await submitStory({ activity_id: detail.id, content: storyInput.trim() });
      setStoryInput("");
      setStatusMessage("Line submitted.");
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit story line");
    } finally {
      setSubmitting(false);
    }
  }, [detail, refresh, storyInput]);

  const totals = useMemo(() => Object.entries(scoreboard.totals), [scoreboard.totals]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Story Tag</h1>
        <p className="text-sm text-slate-600">Match ID {matchId}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">Turn {Math.min(nextTurn, turns)} of {turns}</p>
        <p className="text-xs text-slate-500">Next player: {nextUser ?? "—"}</p>
        {typeof timeRemaining === "number" ? (
          <p className="text-xs text-slate-500">Time remaining: {timeRemaining}s</p>
        ) : null}
      </header>
      {statusMessage ? <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p> : null}
      {error ? <p className="rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading story…</p> : null}
      {detail ? (
        <StoryBoard
          seed={readString(storyMeta["seed"])}
          lines={lines}
          activeUserId={DEMO_USER_ID}
          nextUserId={nextUser ?? null}
        />
      ) : null}
      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your Turn</h2>
        <textarea
          className="mt-3 h-40 w-full rounded border border-slate-300 p-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
          placeholder={isMyTurn ? "Add the next line to the story…" : "Waiting for your partner…"}
          value={storyInput}
          onChange={(event) => setStoryInput(event.target.value.slice(0, maxChars))}
          disabled={!isMyTurn || submitting}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            {storyInput.length}/{maxChars} characters
          </span>
          <button
            type="button"
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            onClick={() => void handleSubmit()}
            disabled={!isMyTurn || submitting || storyInput.trim().length === 0}
          >
            {submitting ? "Submitting…" : "Submit Line"}
          </button>
        </div>
      </section>
      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Scoreboard</h2>
        {totals.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No scores recorded.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Participant</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {totals.map(([userId, total]) => (
                <tr key={userId} className="border-t border-slate-100 text-slate-700">
                  <td className="py-2">
                    {userId}
                    {userId === DEMO_USER_ID ? <span className="ml-1 text-xs text-slate-500">(you)</span> : null}
                  </td>
                  <td className="py-2 text-right font-medium">{total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
