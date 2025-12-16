"use client";

import { useEffect, useState } from "react";
import { HeartHandshake, ShieldCheck, Phone, Activity, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/app/lib/http/client";
import { cn } from "@/lib/utils";

type StatusKind = "live" | "ready" | "startup";

export default function SupportLandingPage() {
  const [statuses, setStatuses] = useState<Record<StatusKind, "healthy" | "degraded" | "down">>({
    live: "healthy",
    ready: "healthy",
    startup: "healthy",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [live, ready, startup] = await Promise.all([
          apiFetch<{ status: string }>("/api/ops/health/live").catch(() => ({ status: "down" })),
          apiFetch<{ status: string }>("/api/ops/health/ready").catch(() => ({ status: "down" })),
          apiFetch<{ status: string }>("/api/ops/health/startup").catch(() => ({ status: "down" })),
        ]);
        setStatuses({
          live: normalise(live.status),
          ready: normalise(ready.status),
          startup: normalise(startup.status),
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6 lg:px-12">
      <section className="mx-auto flex max-w-6xl flex-col gap-4 rounded-3xl border border-indigo-100 bg-white/85 p-8 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
              <HeartHandshake className="h-4 w-4" /> Support
            </p>
            <h1 className="text-3xl font-bold text-navy dark:text-white">We’re here to help</h1>
            <p className="max-w-3xl text-sm text-navy/70 dark:text-slate-400">
              Real pages backed by live services. Reach us, review guides, or check system health below.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-navy/60 dark:text-slate-400">
            <StatusPill label="Live" state={statuses.live} loading={loading} />
            <StatusPill label="Ready" state={statuses.ready} loading={loading} />
            <StatusPill label="Startup" state={statuses.startup} loading={loading} />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-6xl gap-4 md:grid-cols-3">
        <SupportCard
          title="Help Center"
          description="Browse guides and answers. Content is backed by live communities data."
          icon={<HelpCircle className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />}
          href="/help"
        />
        <SupportCard
          title="Safety Guides"
          description="Report issues or review safety steps. Submissions flow to the contact backend."
          icon={<ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />}
          href="/safety"
        />
        <SupportCard
          title="Contact Support"
          description="Send a support ticket directly to the backend contact endpoint."
          icon={<Phone className="h-5 w-5 text-coral" />}
          href="/contact"
        />
      </section>

      <section className="mx-auto mt-8 grid max-w-6xl gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-indigo-100 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-200">
            <Activity className="h-4 w-4" />
            Live status checks
          </div>
          <p className="mt-2 text-sm text-navy/70 dark:text-slate-400">
            These values come directly from <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">/api/ops/health</code>.
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <HealthRow label="Liveness" state={statuses.live} loading={loading} />
            <HealthRow label="Readiness" state={statuses.ready} loading={loading} />
            <HealthRow label="Startup" state={statuses.startup} loading={loading} />
          </div>
          <Link
            href="/status"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-coral dark:text-indigo-300"
          >
            View full system status
          </Link>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-coral/10 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-navy/60 dark:text-slate-400">
            Response promise
          </p>
          <h3 className="mt-2 text-xl font-bold text-navy dark:text-white">Humans will answer</h3>
          <p className="mt-2 text-sm text-navy/70 dark:text-slate-400">
            Support tickets go to the same contact endpoint used across the product. Keep replies flowing to your inbox.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-navy/60 dark:text-slate-400">
            <span className="rounded-xl border border-indigo-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">Avg. reply &lt; 1h</span>
            <span className="rounded-xl border border-indigo-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">Campus-first</span>
          </div>
          <Link
            href="/contact"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-300/40 transition hover:bg-indigo-500 dark:shadow-indigo-900/40"
          >
            Open a ticket
          </Link>
        </div>
      </section>
    </main>
  );
}

function normalise(value: string): "healthy" | "degraded" | "down" {
  const lower = value?.toLowerCase() ?? "";
  if (lower.includes("degraded")) return "degraded";
  if (lower.includes("down") || lower.includes("fail")) return "down";
  return "healthy";
}

function StatusPill({ label, state, loading }: { label: string; state: "healthy" | "degraded" | "down"; loading: boolean }) {
  const styles: Record<typeof state, string> = {
    healthy: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800",
    degraded: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",
    down: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800",
  };
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold", styles[state])}>
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : state === "healthy" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      {label}
    </span>
  );
}

function SupportCard({ title, description, icon, href }: { title: string; description: string; icon: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-indigo-100 bg-white/90 p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/80"
    >
      <div className="flex items-center gap-3 text-sm font-semibold text-navy dark:text-white">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 transition group-hover:scale-105 dark:bg-indigo-900/40 dark:text-indigo-200 dark:ring-indigo-800">
          {icon}
        </span>
        {title}
      </div>
      <p className="text-sm text-navy/70 dark:text-slate-400">{description}</p>
    </Link>
  );
}

function HealthRow({ label, state, loading }: { label: string; state: "healthy" | "degraded" | "down"; loading: boolean }) {
  const colors: Record<typeof state, string> = {
    healthy: "text-emerald-700 dark:text-emerald-200",
    degraded: "text-amber-700 dark:text-amber-200",
    down: "text-rose-700 dark:text-rose-200",
  };
  return (
    <div className="flex items-center justify-between rounded-xl border border-indigo-100/70 bg-white/60 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
      <span className="font-semibold text-navy dark:text-white">{label}</span>
      <span className={cn("inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]", colors[state])}>
        {loading ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : state === "healthy" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        {state}
      </span>
    </div>
  );
}
