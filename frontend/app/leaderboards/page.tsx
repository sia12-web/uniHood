'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import LeaderboardTable from "@/components/LeaderboardTable";
import { fetchLeaderboard } from "@/lib/leaderboards";
import { listCampuses } from "@/lib/identity";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { LeaderboardResponse } from "@/lib/types";

export default function LeaderboardsPage() {
  const [campusId] = useState<string>(getDemoCampusId());
  const [campusName, setCampusName] = useState<string>("Loading campus...");

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

  // Fetch Leaderboard - use "social" scope which shows Social Score levels
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchLeaderboard("social", { campusId, signal: controller.signal })
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
  }, [campusId]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <div className="flex items-center">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-4 text-center">
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-rose-500">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500"></span>
            </span>
            Live Rankings
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {campusName} <span className="text-slate-400">Leaderboard</span>
        </h1>
        <p className="text-lg text-slate-600">
          Compete, connect, and climb the ranks to become a campus legend.
        </p>
      </header>

      {/* Social Score Header */}
      <div className="flex items-center justify-center gap-4 rounded-2xl bg-gradient-to-r from-rose-50 to-amber-50 p-6 border border-rose-100">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <div className="text-left">
          <h2 className="text-2xl font-bold text-slate-900">Social Score</h2>
          <p className="text-sm text-slate-600">Earn points from friends, meetups, and messaging</p>
        </div>
      </div>

      {/* Leaderboard Table */}
      <section className="min-h-[400px]">
        {error ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-8 text-center text-rose-600">
            {error}
          </div>
        ) : (
          <LeaderboardTable
            scope="social"
            items={leaderboard?.items ?? []}
            highlightUserId={userId}
            isLoading={loading}
          />
        )}
      </section>

      {/* Scoring Info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-500">How To Earn Points</h3>

        {/* Point sources */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Friends</p>
              <p className="text-xs text-slate-500">+50 per friend, +30 per invite accepted</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Meetups</p>
              <p className="text-xs text-slate-500">+100 per meetup hosted, +30 per join</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Messaging</p>
              <p className="text-xs text-slate-500">+2 per DM, +1 per room message</p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-400 text-center">
          Daily limits apply to prevent abuse. Accumulate points to increase your Social Score!
        </p>
      </div>
    </main>
  );
}
