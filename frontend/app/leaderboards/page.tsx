'use client';

import { useEffect, useMemo, useState } from "react";

import LeaderboardTable from "@/components/LeaderboardTable";
import StreakBadge from "@/components/StreakBadge";
import { fetchLeaderboard, fetchMySummary } from "@/lib/leaderboards";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { BadgeSummary, LeaderboardPeriod, LeaderboardResponse, LeaderboardScope, MyLeaderboardSummary } from "@/lib/types";

const SCOPES: LeaderboardScope[] = ["overall", "social", "engagement", "popularity"];
const PERIODS: LeaderboardPeriod[] = ["daily", "weekly", "monthly"];

export default function LeaderboardsPage() {
  const [scope, setScope] = useState<LeaderboardScope>("overall");
  const [period, setPeriod] = useState<LeaderboardPeriod>("daily");
  const [campusId, setCampusId] = useState<string>(getDemoCampusId());
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [summary, setSummary] = useState<MyLeaderboardSummary | null>(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const userId = getDemoUserId();

  useEffect(() => {
    const controller = new AbortController();
    setLoadingLeaderboard(true);
    setError(null);
    fetchLeaderboard(scope, { period, campusId, signal: controller.signal })
      .then(setLeaderboard)
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Unable to load leaderboard");
        }
      })
      .finally(() => {
        setLoadingLeaderboard(false);
      });
    return () => controller.abort();
  }, [scope, period, campusId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingSummary(true);
    fetchMySummary({ userId, campusId, signal: controller.signal })
      .then(setSummary)
      .catch(() => {
        /* Non-fatal for initial render */
      })
      .finally(() => setLoadingSummary(false));
    return () => controller.abort();
  }, [userId, campusId]);

  const activeBadges: BadgeSummary[] = useMemo(() => summary?.badges ?? [], [summary]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-semibold text-slate-900">Leaderboards</h1>
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-3 py-1 text-sm ${period === p ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"}`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm text-slate-600">
            Campus ID
            <input
              value={campusId}
              onChange={(event) => setCampusId(event.target.value)}
              className="ml-2 rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <div className="flex gap-2">
            {SCOPES.map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded px-3 py-1 text-sm ${scope === s ? "bg-amber-500 text-white" : "bg-white text-slate-600 shadow"}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? <p className="rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div>
          <LeaderboardTable
            scope={scope}
            items={leaderboard?.items ?? []}
            highlightUserId={userId}
            isLoading={loadingLeaderboard}
          />
        </div>
        <aside className="flex flex-col gap-4">
          {summary ? (
            <StreakBadge current={summary.streak.current} best={summary.streak.best} lastActiveYmd={summary.streak.last_active_ymd} />
          ) : (
            <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">
              {loadingSummary ? "Loading your streak…" : "Streak information unavailable."}
            </div>
          )}

          <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Recent Badges</p>
            {activeBadges.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Earn badges by climbing the leaderboards and keeping a streak.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {activeBadges.map((badge) => (
                  <li key={`${badge.kind}:${badge.earned_ymd}`}
                    className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="font-medium text-slate-700">{badge.kind.replace(/_/g, " ")}</span>
                    <span className="text-xs text-slate-500">{badge.earned_ymd}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
