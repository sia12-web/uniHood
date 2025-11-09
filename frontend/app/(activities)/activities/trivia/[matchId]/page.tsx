"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import TriviaBoard from "@/components/TriviaBoard";
import {
  ActivitiesSocket,
  ActivityDetail,
  ActivityScorePayload,
  RoundOpenEvent,
  Scoreboard,
  activitiesSocket,
  getActivity,
  normalizeScoreboard,
  submitTrivia,
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function activeRound(detail: ActivityDetail | null) {
  return detail?.rounds.find((round) => round.state === "open");
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

export default function TriviaMatchPage({ params }: Props) {
  const { matchId } = params;
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [scoreboard, setScoreboard] = useState<Scoreboard>({ totals: {}, perRound: {}, participants: [] });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [questionOpenedAt, setQuestionOpenedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getActivity(matchId);
      setDetail(data);
      setScoreboard(summaryToScoreboard(data));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trivia match");
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
      setSelectedIndex(null);
      setLatencyMs(null);
      setQuestionOpenedAt(Date.now());
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

  const round = activeRound(detail);
  const roundMetaSource = round?.meta;
  const roundMeta = isRecord(roundMetaSource) ? roundMetaSource : undefined;
  const prompt = readString(roundMeta?.["prompt"]) ?? "Waiting for next question…";
  const options = readStringArray(roundMeta?.["options"]);
  const correctIndex = roundMeta ? parseNumber(roundMeta["correct_idx"]) : null;
  const isScored = round?.state === "scored";
  const revealIndex = isScored ? correctIndex : null;

  useEffect(() => {
    setTimeRemaining(computeCountdown(roundMeta));
    const closeAt = roundMeta ? parseNumber(roundMeta["close_at_ms"]) ?? parseNumber(roundMeta["closeAtMs"]) : null;
    if (!closeAt) {
      return;
    }
    const interval = window.setInterval(() => {
      setTimeRemaining(computeCountdown(roundMeta));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [roundMeta]);

  useEffect(() => {
    if (!roundMeta) {
      return;
    }
    setQuestionOpenedAt(Date.now());
    setSelectedIndex(null);
    setLatencyMs(null);
  }, [roundMeta, round?.idx]);

  const handleSelect = useCallback((idx: number) => {
    if (submitting || detail?.state !== "active" || round?.state !== "open") {
      return;
    }
    setSelectedIndex(idx);
  }, [detail?.state, round?.state, submitting]);

  const handleSubmit = useCallback(async () => {
    if (!detail || selectedIndex === null || round?.idx === undefined) {
      return;
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      const started = questionOpenedAt ?? Date.now();
      const latency = Date.now() - started;
      const payload = await submitTrivia({ activity_id: detail.id, round_idx: round.idx, choice_idx: selectedIndex });
      setScoreboard(normalizeScoreboard(payload));
      setLatencyMs(latency);
      setStatusMessage("Answer submitted.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit answer");
    } finally {
      setSubmitting(false);
    }
  }, [detail, questionOpenedAt, round?.idx, selectedIndex]);

  const totals = useMemo(() => Object.entries(scoreboard.totals), [scoreboard.totals]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Trivia Challenge</h1>
        <p className="text-sm text-slate-600">Match ID {matchId}</p>
        {typeof timeRemaining === "number" ? (
          <p className="text-xs text-slate-500">Time remaining: {timeRemaining}s</p>
        ) : null}
      </header>
      {statusMessage ? <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p> : null}
      {error ? <p className="rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading trivia…</p> : null}
      <TriviaBoard
        prompt={prompt}
        options={options}
        selected={selectedIndex}
        onSelect={handleSelect}
        disabled={detail?.state !== "active" || round?.state !== "open"}
        revealed={revealIndex}
        latency={latencyMs}
      />
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
          onClick={() => void handleSubmit()}
          disabled={selectedIndex === null || submitting || detail?.state !== "active" || round?.state !== "open"}
        >
          {submitting ? "Submitting…" : "Submit Answer"}
        </button>
      </div>
      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Scoreboard</h2>
        {totals.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No scores yet.</p>
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
