"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ulid } from "ulidx";

import {
  ActivitiesSocket,
  ActivityDetail,
  ActivityScorePayload,
  RpsPhaseEvent,
  RoundOpenEvent,
  Scoreboard,
  activitiesSocket,
  getActivity,
  normalizeScoreboard,
  rpsCommit,
  rpsReveal,
  summaryToScoreboard,
} from "@/lib/activities";
import { getDemoUserId } from "@/lib/env";

type Props = { params: { matchId: string } };

type RpsChoice = "rock" | "paper" | "scissors";

type StoredCommit = {
  choice: RpsChoice;
  nonce: string;
  hash: string;
  round: number;
};

const DEMO_USER_ID = getDemoUserId();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(meta: Record<string, unknown>, key: string, fallback = 0): number {
  const candidate = meta[key];
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeCountdown(roundMeta: Record<string, unknown> | undefined, phase: string): number | null {
  if (!roundMeta) {
    return null;
  }
  const key = phase === "reveal" ? "reveal_close_at_ms" : "commit_close_at_ms";
  const closeAt = readNumber(roundMeta, key, 0);
  if (!closeAt) {
    return null;
  }
  const remaining = Math.floor((closeAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

function parseStoredCommit(value: unknown): StoredCommit | null {
  if (!isRecord(value)) {
    return null;
  }
  const choice = value.choice;
  const nonce = value.nonce;
  const hash = value.hash;
  const round = value.round;
  if (choice === "rock" || choice === "paper" || choice === "scissors") {
    if (typeof nonce === "string" && typeof hash === "string" && typeof round === "number") {
      return { choice, nonce, hash, round };
    }
  }
  return null;
}

function parseResults(meta: Record<string, unknown>): Array<{ idx: number; winner: string }> {
  const raw = meta.results;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const idx = readNumber(entry, "idx", 0);
      const winnerRaw = entry.winner;
      const winner = typeof winnerRaw === "string" ? winnerRaw : "draw";
      return { idx, winner };
    })
    .filter((entry): entry is { idx: number; winner: string } => entry !== null);
}

async function sha256Hex(value: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  const nodeCrypto = await import("crypto");
  return nodeCrypto.createHash("sha256").update(value).digest("hex");
}

function storageKey(activityId: string): string {
  return `rps:${activityId}:${DEMO_USER_ID}`;
}

export default function RPSMatchPage({ params }: Props) {
  const { matchId } = params;
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [scoreboard, setScoreboard] = useState<Scoreboard>({ totals: {}, perRound: {} });
  const [selection, setSelection] = useState<RpsChoice | null>(null);
  const [commitState, setCommitState] = useState<{ choice: RpsChoice; nonce: string; hash: string; round: number } | null>(null);
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
      setError(err instanceof Error ? err.message : "Failed to load RPS match");
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
    const handlePhase = (payload: RpsPhaseEvent) => {
      if (payload.activity_id !== matchId) {
        return;
      }
      void refresh();
    };
    const handleRoundOpen = (payload: RoundOpenEvent) => {
      if (payload.activity_id !== matchId) {
        return;
      }
      void refresh();
    };
    socket.emit("activity_join", { activity_id: matchId });
    socket.on("score:update", handleScore);
    socket.on("rps:phase", handlePhase);
    socket.on("round:open", handleRoundOpen);
    return () => {
      socket.emit("activity_leave", { activity_id: matchId });
      socket.off("score:update", handleScore);
      socket.off("rps:phase", handlePhase);
      socket.off("round:open", handleRoundOpen);
    };
  }, [matchId, refresh]);

  const detailMeta = isRecord(detail?.meta) ? (detail?.meta as Record<string, unknown>) : {};
  const rpsMetaValue = detailMeta["rps"];
  const rpsMetaSource: Record<string, unknown> = isRecord(rpsMetaValue)
    ? (rpsMetaValue as Record<string, unknown>)
    : {};
  const phaseRaw = rpsMetaSource["phase"];
  const phase = typeof phaseRaw === "string" ? phaseRaw : "commit";
  const currentRoundIdx = readNumber(rpsMetaSource, "current_round", 1);
  const round = detail?.rounds.find((item) => item.idx === currentRoundIdx);
  const roundsNeeded = readNumber(rpsMetaSource, "best_of", 3);
  const results = parseResults(rpsMetaSource);
  const detailId = detail?.id ?? null;
  const detailStorageKey = detailId ? storageKey(detailId) : null;

  useEffect(() => {
    if (!detailId) {
      setCommitState(null);
      return;
    }
    if (typeof window === "undefined" || !detailStorageKey) {
      return;
    }
    const stored = window.localStorage.getItem(detailStorageKey);
    if (!stored) {
      return;
    }
    try {
      const parsed = parseStoredCommit(JSON.parse(stored));
      if (parsed && parsed.round === currentRoundIdx) {
        setCommitState(parsed);
      } else {
        setCommitState(null);
      }
    } catch {
      setCommitState(null);
    }
  }, [detailId, detailStorageKey, currentRoundIdx]);

  useEffect(() => {
    const roundMetaValue = round?.meta;
    const meta = isRecord(roundMetaValue) ? roundMetaValue : undefined;
    setTimeRemaining(computeCountdown(meta, phase));
    if (!meta) {
      return;
    }
    const interval = window.setInterval(() => {
      setTimeRemaining(computeCountdown(meta, phase));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [round, phase]);

  useEffect(() => {
    setSelection(null);
    if (phase === "commit" && commitState && commitState.round !== currentRoundIdx) {
      setCommitState(null);
      if (typeof window !== "undefined" && detailStorageKey) {
        window.localStorage.removeItem(detailStorageKey);
      }
    }
  }, [phase, currentRoundIdx, commitState, detailStorageKey]);

  const handleCommit = useCallback(async () => {
    if (!detail || !selection || phase !== "commit") {
      return;
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      const nonce = ulid();
      const hash = await sha256Hex(`${selection}|${nonce}`);
      await rpsCommit({ activity_id: detail.id, round_idx: currentRoundIdx, commit_hash: hash });
      const record = { choice: selection, nonce, hash, round: currentRoundIdx };
      setCommitState(record);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(detail.id), JSON.stringify(record));
      }
      setStatusMessage("Move committed. Reveal once both players are ready.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to commit move");
    } finally {
      setSubmitting(false);
    }
  }, [detail, selection, phase, currentRoundIdx]);

  const handleReveal = useCallback(async () => {
    if (!detail || !commitState || phase !== "reveal" || commitState.round !== currentRoundIdx) {
      return;
    }
    setSubmitting(true);
    setStatusMessage(null);
    try {
      const payload = await rpsReveal({
        activity_id: detail.id,
        round_idx: currentRoundIdx,
        choice: commitState.choice,
        commit_hash: commitState.hash,
        nonce: commitState.nonce,
      });
      setScoreboard(normalizeScoreboard(payload));
      setStatusMessage("Move revealed.");
      setError(null);
      setCommitState(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey(detail.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal move");
    } finally {
      setSubmitting(false);
    }
  }, [detail, commitState, phase, currentRoundIdx]);

  const totals = useMemo(() => Object.entries(scoreboard.totals), [scoreboard.totals]);
  const choices: RpsChoice[] = ["rock", "paper", "scissors"];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Rock · Paper · Scissors</h1>
        <p className="text-sm text-slate-600">Match ID {matchId}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">Phase: {phase}</p>
        <p className="text-xs text-slate-500">Round {currentRoundIdx} / {roundsNeeded}</p>
        {typeof timeRemaining === "number" ? <p className="text-xs text-slate-500">Time remaining: {timeRemaining}s</p> : null}
      </header>
      {statusMessage ? <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p> : null}
      {error ? <p className="rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading match…</p> : null}
      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your Move</h2>
        <p className="mt-1 text-xs text-slate-500">
          Select a gesture and commit it during the commit phase, then reveal with the stored nonce during the reveal phase.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {choices.map((choice) => {
            const isSelected = selection === choice;
            return (
              <button
                key={choice}
                type="button"
                className={`rounded border px-4 py-2 text-sm font-medium capitalize transition ${
                  phase !== "commit" || submitting
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : isSelected
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-600"
                }`}
                onClick={() => phase === "commit" && !submitting ? setSelection(choice) : undefined}
                disabled={phase !== "commit" || submitting}
              >
                {choice}
              </button>
            );
          })}
        </div>
        {phase === "commit" ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={() => void handleCommit()}
              disabled={!selection || submitting}
            >
              {submitting ? "Committing…" : "Commit Move"}
            </button>
          </div>
        ) : null}
        {phase === "reveal" ? (
          <div className="mt-4 flex flex-col gap-3">
            {commitState ? (
              <>
                <p className="text-sm text-slate-600">
                  Stored move: <span className="font-semibold text-slate-800 capitalize">{commitState.choice}</span>
                </p>
                <p className="text-xs text-slate-500">Nonce: {commitState.nonce}</p>
              </>
            ) : (
              <p className="text-sm text-rose-600">
                No stored commit found. If you refreshed the page, you may need to coordinate a restart.
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400"
                onClick={() => void handleReveal()}
                disabled={!commitState || submitting}
              >
                {submitting ? "Revealing…" : "Reveal Move"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Round Results</h2>
        {results.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No rounds completed yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {results.map((entry) => (
              <li key={entry.idx} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2">
                <span>Round {entry.idx}</span>
                <span className="font-medium text-slate-800">
                  {entry.winner === "draw"
                    ? "Draw"
                    : entry.winner === "a"
                    ? detail?.user_a
                    : detail?.user_b}
                </span>
              </li>
            ))}
          </ul>
        )}
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
                <th className="pb-2 text-right">Wins</th>
              </tr>
            </thead>
            <tbody>
              {totals.map(([userId, total]) => (
                <tr key={userId} className="border-t border-slate-100 text-slate-700">
                  <td className="py-2">
                    {userId}
                    {userId === DEMO_USER_ID ? <span className="ml-1 text-xs text-slate-500">(you)</span> : null}
                  </td>
                  <td className="py-2 text-right font-medium">{total.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
