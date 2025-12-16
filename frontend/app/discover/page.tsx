"use client";

import { Compass, Map, Users, Sparkles } from "lucide-react";
import Link from "next/link";
import DiscoveryFeed from "@/components/DiscoveryFeed";

export default function DiscoverPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-rose-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-12 sm:pt-16">
        <div className="flex flex-col gap-6 rounded-3xl border border-warm-sand/60 bg-white/80 p-8 shadow-xl backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                <Sparkles className="h-4 w-4" /> Discover
              </p>
              <h1 className="text-3xl font-bold text-navy sm:text-4xl dark:text-white">See who&apos;s active around you</h1>
              <p className="max-w-3xl text-base text-navy/70 dark:text-slate-400">
                Browse nearby students, campus creators, and friends of friends. Everything below stays in sync with the live presence and friends services from the backend.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-navy/70 dark:text-slate-400">
              <Metric icon={<Compass className="h-4 w-4" />} label="Campus" value="Real-time" />
              <Metric icon={<Users className="h-4 w-4" />} label="Connections" value="Friends & invites" />
              <Metric icon={<Map className="h-4 w-4" />} label="Presence" value="Live proximity" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-medium text-navy/70 dark:text-slate-300">
            <Link href="/feed" className="rounded-full border border-warm-sand/70 px-4 py-2 transition hover:-translate-y-0.5 hover:border-coral hover:text-coral dark:border-slate-700 dark:hover:border-coral">
              Community feed
            </Link>
            <Link href="/map" className="rounded-full border border-warm-sand/70 px-4 py-2 transition hover:-translate-y-0.5 hover:border-coral hover:text-coral dark:border-slate-700 dark:hover:border-coral">
              Interactive map
            </Link>
            <Link href="/activities" className="rounded-full border border-warm-sand/70 px-4 py-2 transition hover:-translate-y-0.5 hover:border-coral hover:text-coral dark:border-slate-700 dark:hover:border-coral">
              Events & activities
            </Link>
          </div>
        </div>
      </section>

      <DiscoveryFeed />
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-warm-sand/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] dark:border-slate-700">
      <span className="text-coral">{icon}</span>
      <span className="text-navy/60 dark:text-slate-400">{label}</span>
      <span className="text-navy dark:text-white">{value}</span>
    </div>
  );
}
