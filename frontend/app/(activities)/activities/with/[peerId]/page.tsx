"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityKind,
  ActivityOptions,
  ActivitySummary,
  cancelActivity,
  createActivity,
  listActivities,
  startActivity,
  summaryToScoreboard,
} from "@/lib/activities";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";

type Props = { params: { peerId: string } };

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

const DEFAULT_OPTIONS: Record<ActivityKind, ActivityOptions> = {
  typing_duel: { typing: { duration_s: 60 } },
  story_alt: { story: { turns: 4, turn_seconds: 45, max_chars_per_turn: 320 } },
  trivia: { trivia: { questions: 3, per_question_s: 12 } },
  rps: { rps: { best_of: 3 } },
};

const KIND_LABEL: Record<ActivityKind, string> = {
  typing_duel: "Typing Duel",
  story_alt: "Story Tag",
  trivia: "Trivia",
  rps: "Rock · Paper · Scissors",
};

function resolveMatchPath(activity: ActivitySummary): string {
  switch (activity.kind) {
    case "typing_duel":
      return `/activities/typing/${activity.id}`;
    case "story_alt":
      return `/activities/story/${activity.id}`;
    case "trivia":
      return `/activities/trivia/${activity.id}`;
    case "rps":
      return `/activities/rps/${activity.id}`;
    default:
      return "#";
  }
}

function participantLabel(activity: ActivitySummary, peerId: string): string {
  const isInitiator = activity.user_a === DEMO_USER_ID;
  const partner = activity.user_a === DEMO_USER_ID ? activity.user_b : activity.user_a;
  const opponent = partner === peerId ? peerId : partner;
  return isInitiator ? `You vs ${opponent}` : `${activity.user_a} vs ${activity.user_b}`;
}

export default function PeerActivityPage({ params }: Props) {
  const { peerId } = params;
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listActivities();
      const filtered = all.filter((activity) => activity.user_a === peerId || activity.user_b === peerId);
      setActivities(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load activities");
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [peerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(
    async (kind: ActivityKind) => {
      setBusyKey(`create-${kind}`);
      setActionMessage(null);
      try {
        await createActivity(peerId, { kind, options: DEFAULT_OPTIONS[kind] });
        setActionMessage(`${KIND_LABEL[kind]} created.`);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create activity");
      } finally {
        setBusyKey(null);
      }
    },
    [peerId, refresh],
  );

  const handleStart = useCallback(
    async (activityId: string, kind: ActivityKind) => {
      setBusyKey(`start-${activityId}`);
      setActionMessage(null);
      try {
        await startActivity(activityId);
        setActionMessage(`${KIND_LABEL[kind]} started.`);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start activity");
      } finally {
        setBusyKey(null);
      }
    },
    [refresh],
  );

  const handleCancel = useCallback(
    async (activityId: string) => {
      setBusyKey(`cancel-${activityId}`);
      setActionMessage(null);
      try {
        await cancelActivity(activityId, "cancelled");
        setActionMessage("Activity cancelled.");
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cancel activity");
      } finally {
        setBusyKey(null);
      }
    },
    [refresh],
  );

  const creationButtons = useMemo(() => {
    const kinds: ActivityKind[] = ["typing_duel", "story_alt", "trivia", "rps"];
    return kinds.map((kind) => (
      <button
        key={kind}
        type="button"
        onClick={() => void handleCreate(kind)}
        disabled={busyKey !== null}
        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        Start {KIND_LABEL[kind]}
      </button>
    ));
  }, [busyKey, handleCreate]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Mini-Activities with {peerId}</h1>
        <p className="text-sm text-slate-600">
          As {DEMO_USER_ID} on campus {DEMO_CAMPUS_ID}, challenge your friend to quick competitive games.
        </p>
      </header>
      <section className="flex flex-wrap gap-3">{creationButtons}</section>
      {actionMessage ? (
        <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{actionMessage}</p>
      ) : null}
      {error ? <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading activities…</p> : null}
      <section className="grid gap-4">
        {activities.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No activities yet. Create one to get started.</p>
        ) : null}
        {activities.map((activity) => {
          const scoreboard = summaryToScoreboard(activity);
          const myScore = scoreboard.totals[DEMO_USER_ID] ?? 0;
          const theirScore = scoreboard.totals[peerId] ?? 0;
          const matchPath = resolveMatchPath(activity);
          const isLobby = activity.state === "lobby";
          const isActive = activity.state === "active";
          return (
            <article key={activity.id} className="rounded border border-slate-200 bg-white p-4 shadow-sm">
              <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{KIND_LABEL[activity.kind]}</h2>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{participantLabel(activity, peerId)}</p>
                </div>
                <p className="text-sm text-slate-600">
                  Status: <span className="font-medium text-slate-800">{activity.state}</span>
                </p>
              </header>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                <div>
                  <p className="text-xs text-slate-500">Score</p>
                  <p className="font-medium text-slate-800">You {myScore.toFixed(1)} · {theirScore.toFixed(1)} Them</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Created</p>
                  <p>{new Date(activity.created_at).toLocaleString()}</p>
                </div>
              </div>
              <footer className="mt-4 flex flex-wrap gap-3 text-sm">
                {isLobby ? (
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-2 font-medium text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400"
                    onClick={() => void handleStart(activity.id, activity.kind)}
                    disabled={busyKey !== null}
                  >
                    Start
                  </button>
                ) : null}
                {isActive || activity.state === "completed" ? (
                  <Link href={matchPath} className="rounded border border-indigo-500 px-3 py-2 font-medium text-indigo-600 hover:bg-indigo-50">
                    Open Match
                  </Link>
                ) : null}
                {activity.state === "lobby" ? (
                  <button
                    type="button"
                    className="rounded border border-rose-400 px-3 py-2 font-medium text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void handleCancel(activity.id)}
                    disabled={busyKey !== null}
                  >
                    Cancel
                  </button>
                ) : null}
              </footer>
            </article>
          );
        })}
      </section>
    </main>
  );
}
