"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Sparkles, Timer, Users } from "lucide-react";
import Link from "next/link";
import type { ActivitySummary } from "@/lib/activities";
import { listActivities } from "@/lib/activities";
import { cn } from "@/lib/utils";

export default function ActivitiesHubPage() {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listActivities();
        if (mounted) setActivities(data);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load activities.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-slate-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6 lg:px-12">
      <section className="mx-auto flex max-w-6xl flex-col gap-4 rounded-3xl border border-amber-100 bg-white/85 p-8 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
              <Sparkles className="h-4 w-4" /> Events & activities
            </p>
            <h1 className="text-3xl font-bold text-navy dark:text-white">Pick a duel, story, or meetup</h1>
            <p className="max-w-3xl text-sm text-navy/70 dark:text-slate-400">
              This list is pulled from the activities backend so you&apos;re always seeing what&apos;s live right now.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-navy/60 dark:text-slate-400">
            <Badge label="Realtime" />
            <Badge label="Backend-synced" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-medium text-navy/70 dark:text-slate-300">
          <QuickLink href="/activities/quick_trivia" label="Quick Trivia" />
          <QuickLink href="/activities/rock_paper_scissors" label="Rock Paper Scissors" />
          <QuickLink href="/activities/story" label="Story Builder" />
          <QuickLink href="/activities/speed_typing" label="Speed Typing" />
          <QuickLink href="/activities/tictactoe" label="Tic Tac Toe" />
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-amber-100 bg-white/80 p-10 text-amber-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-amber-200">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600 dark:border-slate-700 dark:border-t-amber-400" />
            <span className="ml-3 text-sm font-medium">Syncing activities from the server...</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-semibold">Couldn&apos;t load activities</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
            {activities.length === 0 && (
              <div className="col-span-full rounded-2xl border border-amber-100 bg-white/80 p-6 text-sm text-navy/70 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                No sessions yet—start one of the activities above to seed the feed.
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ActivityCard({ activity }: { activity: ActivitySummary }) {
  const statusStyles: Record<ActivitySummary["state"], string> = {
    lobby: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-800",
    active: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-800",
    running: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-800",
    completed: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700",
    cancelled: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-800",
    expired: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700",
  };

  const metaScore = activity.meta?.score as { totals?: Record<string, unknown> } | undefined;
  const scoreLabel = metaScore?.totals ? Object.keys(metaScore.totals).length : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-white/90 p-5 shadow-md transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-navy/50 dark:text-slate-400">
              {activity.kind}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-navy dark:text-white">{activity.id}</h3>
          <p className="text-xs font-medium text-navy/60 dark:text-slate-400">
            Created by {activity.user_a} vs {activity.user_b}
          </p>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold", statusStyles[activity.state])}>
          {activity.state}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-navy/70 dark:text-slate-400">
        <Stat icon={<Users className="h-4 w-4 text-amber-500" />} label="Players" value="2" />
        <Stat icon={<Timer className="h-4 w-4 text-amber-500" />} label="Started" value={activity.started_at ? "Yes" : "Waiting"} />
        <Stat icon={<Sparkles className="h-4 w-4 text-amber-500" />} label="Scorecard" value={scoreLabel ? `${scoreLabel} rows` : "Pending"} />
        <Stat icon={<Gamepad2 className="h-4 w-4 text-amber-500" />} label="State" value={activity.state} />
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-100 px-3 py-2 dark:border-slate-800">
      <span>{icon}</span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy/50 dark:text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-navy dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-amber-200 px-3 py-1 dark:border-slate-700">{label}</span>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/60 px-4 py-2 text-sm font-semibold text-navy shadow-sm transition hover:-translate-y-0.5 hover:border-coral hover:text-coral dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
    >
      <Sparkles className="h-4 w-4 text-amber-500" />
      {label}
    </Link>
  );
}
