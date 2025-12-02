'use client';

import { useEffect, useState } from "react";

import LeaderboardTable from "@/components/LeaderboardTable";
import { fetchLeaderboard } from "@/lib/leaderboards";
import { listCampuses } from "@/lib/identity";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { LeaderboardPeriod, LeaderboardResponse, LeaderboardScope } from "@/lib/types";

const PERIODS: LeaderboardPeriod[] = ["daily", "weekly", "monthly"];

type GameOption = {
  id: LeaderboardScope;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const GAMES: GameOption[] = [
  {
    id: "overall",
    label: "Total Score",
    description: "Aggregate performance across all activities",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM6.97 11.03a.75.75 0 111.06-1.06l.75.75a.75.75 0 11-1.06 1.06l-.75-.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "tictactoe",
    label: "Tic-Tac-Toe",
    description: "Classic strategy game",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
      </svg>
    ),
  },
  {
    id: "typing_duel",
    label: "Typing Duel",
    description: "Speed and accuracy race",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 19a2 2 0 100-4 2 2 0 000 4zM11 19v-5.5a2.5 2.5 0 015 0V19M5 19v-5.5a2.5 2.5 0 015 0V19M15 11h3m-3-4h2" />
      </svg>
    ),
  },
  {
    id: "trivia",
    label: "Trivia",
    description: "Test your knowledge",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    id: "rps",
    label: "Rock Paper Scissors",
    description: "Quick decision making",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75v-4.5c0-1.243-1.007-2.25-2.25-2.25h-3c-1.243 0-2.25 1.007-2.25 2.25v2.25M14.25 9.75h-3.75M14.25 9.75a2.25 2.25 0 012.25 2.25v6.75a2.25 2.25 0 01-2.25 2.25h-6a2.25 2.25 0 01-2.25-2.25v-6.75a2.25 2.25 0 012.25-2.25M16.5 7.5V6a2.25 2.25 0 012.25-2.25h1.5A2.25 2.25 0 0122.5 6v1.5M16.5 7.5h3.75" />
      </svg>
    ),
  },
  {
    id: "story_alt",
    label: "Story Mode",
    description: "Collaborative storytelling",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
];

export default function LeaderboardsPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("daily");
  const [campusId] = useState<string>(getDemoCampusId());
  const [campusName, setCampusName] = useState<string>("Loading campus...");

  const [selectedScope, setSelectedScope] = useState<LeaderboardScope>("overall");
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const userId = getDemoUserId();

  // Fetch Campus Name
  useEffect(() => {
    let cancelled = false;
    listCampuses()
      .then((campuses) => {
        if (cancelled) return;
        const current = campuses.find((c) => c.id === campusId);
        setCampusName(current?.name || "Unknown Campus");
      })
      .catch(() => {
        if (!cancelled) setCampusName("Campus");
      });
    return () => {
      cancelled = true;
    };
  }, [campusId]);

  // Fetch Leaderboard
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchLeaderboard(selectedScope, { period, campusId, signal: controller.signal })
      .then(setLeaderboard)
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to load leaderboard", err);
          setError("Failed to load leaderboard data.");
        }
      })
      .finally(() => {
        setLoading(false);
      });
    return () => controller.abort();
  }, [selectedScope, period, campusId]);

  const selectedGame = GAMES.find((g) => g.id === selectedScope) || GAMES[0];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 p-6">
      {/* Header */}
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-rose-500">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500"></span>
            </span>
            Live Rankings
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {campusName} <span className="text-slate-400">Leaderboards</span>
          </h1>
          <p className="text-lg text-slate-600">
            Compete in daily challenges and climb the ranks to become a campus legend.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="text-sm font-medium text-slate-500">
            Showing top performers for <span className="text-slate-900">{period}</span>
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr,320px]">
        {/* Left Column: Leaderboard Table */}
        <section className="min-h-[500px]">
          <div className="mb-6 flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${selectedScope === 'overall' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
              }`}>
              {selectedGame.icon}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{selectedGame.label}</h2>
              <p className="text-sm text-slate-500">{selectedGame.description}</p>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-8 text-center text-rose-600">
              {error}
            </div>
          ) : (
            <LeaderboardTable
              scope={selectedScope}
              items={leaderboard?.items ?? []}
              highlightUserId={userId}
              isLoading={loading}
            />
          )}
        </section>

        {/* Right Column: Game List */}
        <aside className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Select Activity</h3>
          <div className="flex flex-col gap-3">
            {GAMES.map((game) => (
              <button
                key={game.id}
                onClick={() => setSelectedScope(game.id)}
                className={`group flex items-center gap-4 rounded-2xl border p-4 text-left transition-all hover:border-rose-200 hover:shadow-md ${selectedScope === game.id
                  ? "border-rose-500 bg-rose-50 ring-1 ring-rose-500"
                  : "border-slate-200 bg-white shadow-sm"
                  }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${selectedScope === game.id ? "bg-rose-200 text-rose-700" : "bg-slate-100 text-slate-500 group-hover:bg-rose-100 group-hover:text-rose-600"
                  }`}>
                  {game.icon}
                </div>
                <div>
                  <p className={`font-semibold ${selectedScope === game.id ? "text-rose-900" : "text-slate-900"}`}>
                    {game.label}
                  </p>
                  <p className={`text-xs ${selectedScope === game.id ? "text-rose-700" : "text-slate-500"}`}>
                    {game.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
