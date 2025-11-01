"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import TypingPrompt from "@/components/TypingPrompt";
import {
  ActivitiesSocket,
  ActivityDetail,
  ActivityScorePayload,
  RoundOpenEvent,
  Scoreboard,
  activitiesSocket,
  getActivity,
  normalizeScoreboard,
  submitTyping,
  summaryToScoreboard,
} from "@/lib/activities";
import { getDemoUserId } from "@/lib/env";

type Props = { params: { matchId: string } };

const DEMO_USER_ID = getDemoUserId();

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

function derivePrompt(detail: ActivityDetail | null): string {
  const roundMetaSource = detail?.rounds.find((round) => round.idx === 1)?.meta;
  const roundMeta = isRecord(roundMetaSource) ? roundMetaSource : {};
  const detailMeta = detail?.meta;
  const typingMetaSource = isRecord(detailMeta) ? detailMeta["typing"] : undefined;
  const typingMeta = isRecord(typingMetaSource) ? typingMetaSource : {};
  return readString(roundMeta["prompt"]) ?? readString(typingMeta["prompt"]) ?? "";
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

export default function TypingMatchPage({ params }: Props) {
  const { matchId } = params;
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [scoreboard, setScoreboard] = useState<Scoreboard>({ totals: {}, perRound: {} });
  const [text, setText] = useState<string>("");
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
      setError(err instanceof Error ? err.message : "Failed to load activity");
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
    const handleRoundOpen = (payload: RoundOpenEvent) => {
      if (payload.activity_id !== matchId) {
        return;
      }
      void refresh();
    };
    socket.emit("activity_join", { activity_id: matchId });
    socket.on("score:update", handleScore);
    socket.on("round:open", handleRoundOpen);
    return () => {
      socket.emit("activity_leave", { activity_id: matchId });
      socket.off("score:update", handleScore);
      socket.off("round:open", handleRoundOpen);
    };
  }, [matchId, refresh]);

  useEffect(() => {
    const roundMetaSource = detail?.rounds.find((round) => round.idx === 1)?.meta;
    const meta = isRecord(roundMetaSource) ? roundMetaSource : undefined;
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

  const prompt = useMemo(() => derivePrompt(detail), [detail]);
  const activityState = detail?.state ?? "loading";
  const roundState = detail?.rounds.find((round) => round.idx === 1)?.state ?? "pending";
  const isComplete = activityState === "completed";

  const handleSubmit = useCallback(async () => {
    if (!detail) {
      return;
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      const payload = await submitTyping({ activity_id: detail.id, round_idx: 1, text });
      setScoreboard(normalizeScoreboard(payload));
      setStatusMessage("Submission sent.");
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit typing entry");
    } finally {
      setSubmitting(false);
    }
  }, [detail, refresh, text]);

  const totals = useMemo(() => Object.entries(scoreboard.totals), [scoreboard.totals]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Typing Duel</h1>
        <p className="text-sm text-slate-600">Match ID {matchId}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">State: {activityState}</p>
        <p className="text-xs text-slate-500">Round status: {roundState}</p>
      </header>
      {statusMessage ? <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p> : null}
      {error ? <p className="rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading match…</p> : null}
      {detail ? (
        <TypingPrompt
          prompt={prompt}
          value={text}
          onChange={setText}
          onSubmit={handleSubmit}
          disabled={isComplete || submitting || roundState !== "open"}
          timeRemaining={timeRemaining}
          isSubmitting={submitting}
        />
      ) : null}
      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Scoreboard</h2>
        {totals.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No scores recorded yet.</p>
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
