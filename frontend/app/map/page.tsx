"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MapPin, Clock, Users, RefreshCw, Navigation } from "lucide-react";
import type { MeetupResponse } from "@/lib/meetups";
import { listMeetups } from "@/lib/meetups";
import { cn } from "@/lib/utils";

type PositionedMeetup = MeetupResponse & { x: number; y: number };

export default function InteractiveMapPage() {
  const [meetups, setMeetups] = useState<PositionedMeetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeetups = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listMeetups(undefined, undefined);
      const positioned = rows.map((row, idx) => ({
        ...row,
        ...computePosition(row.id ?? String(idx)),
      }));
      setMeetups(positioned);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load campus activities.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMeetups();
  }, []);

  const nowLabel = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-slate-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6 lg:px-12">
      <section className="mx-auto flex max-w-6xl flex-col gap-4 rounded-3xl border border-blue-100 bg-white/80 p-8 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
              <Navigation className="h-4 w-4" /> Interactive map
            </p>
            <h1 className="text-3xl font-bold text-navy dark:text-white">On-campus map of meetups</h1>
            <p className="max-w-3xl text-sm text-navy/70 dark:text-slate-400">
              Every pin comes from the meetups backend endpoint, so you can see what&apos;s live without leaving the dashboard.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-navy/60 dark:text-slate-400">
            <span className="rounded-full border border-blue-100 px-3 py-1 dark:border-slate-700">Synced {nowLabel}</span>
            <button
              onClick={fetchMeetups}
              className="inline-flex items-center gap-2 rounded-full border border-blue-200 px-3 py-1 text-blue-700 transition hover:-translate-y-0.5 hover:border-coral hover:text-coral dark:border-slate-700 dark:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-rose-50 p-6 shadow-xl dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.08),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(249,115,22,0.08),transparent_30%)]" />
          <div className="relative grid h-[520px] grid-cols-6 grid-rows-4 gap-3 rounded-2xl border border-blue-100/70 bg-white/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            {loading ? (
              <div className="col-span-6 row-span-4 flex flex-col items-center justify-center gap-3 text-blue-600 dark:text-slate-200">
                <div className="rounded-full bg-blue-100 p-4 dark:bg-blue-900/50">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
                <p className="text-sm font-medium">Loading meetups from the backend...</p>
              </div>
            ) : error ? (
              <div className="col-span-6 row-span-4 flex flex-col items-center justify-center gap-3 text-rose-600 dark:text-rose-200">
                <p className="text-sm font-semibold">{error}</p>
                <button
                  onClick={fetchMeetups}
                  className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-300/30 transition hover:bg-rose-500 dark:shadow-rose-900/40"
                >
                  Retry
                </button>
              </div>
            ) : meetups.length === 0 ? (
              <div className="col-span-6 row-span-4 flex flex-col items-center justify-center gap-3 text-navy/70 dark:text-slate-300">
                <MapPin className="h-10 w-10 text-blue-500" />
                <p className="text-sm font-medium">No meetups scheduled yet. Check back soon.</p>
              </div>
            ) : (
              meetups.map((meetup) => (
                <div
                  key={meetup.id}
                  style={{
                    gridColumnStart: Math.max(1, Math.min(6, Math.round(meetup.x * 6))),
                    gridRowStart: Math.max(1, Math.min(4, Math.round(meetup.y * 4))),
                  }}
                  className="group relative"
                >
                  <div className={cn(
                    "absolute -left-3 -top-3 flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white shadow-lg shadow-blue-300/40 transition group-hover:-translate-y-1 dark:shadow-blue-900/50",
                    meetup.status === "ACTIVE" && "bg-emerald-600 shadow-emerald-300/40 dark:shadow-emerald-900/50",
                    meetup.status === "CANCELLED" && "bg-rose-500 shadow-rose-300/40 dark:shadow-rose-900/60"
                  )}>
                    <MapPin className="h-3.5 w-3.5" />
                    {meetup.category.toUpperCase()}
                  </div>
                  <div className="relative h-full min-h-[160px] rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-md transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/80">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-navy dark:text-white line-clamp-1">{meetup.title}</h3>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy/50 dark:text-slate-400">
                          {meetup.visibility === "PRIVATE" ? "Invite only" : "Open campus"}
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                        {meetup.status}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-navy/70 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-500" />
                        <span>{formatDistanceToNow(new Date(meetup.start_at), { addSuffix: true })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        <span>{meetup.participants_count} joined / {meetup.capacity} capacity</span>
                      </div>
                      {meetup.description && (
                        <p className="line-clamp-2 text-sm text-navy/70 dark:text-slate-400">{meetup.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function computePosition(id: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 3)) % 9973;
  }
  // Spread over 0-1 range for both axes
  const x = ((hash % 113) + 5) / 120;
  const y = (((hash / 113) % 97) + 5) / 110;
  return { x, y };
}
