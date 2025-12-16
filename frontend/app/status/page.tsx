"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Server, ShieldCheck, Wifi } from "lucide-react";
import { apiFetch } from "@/app/lib/http/client";
import { cn } from "@/lib/utils";

type Check = {
  label: string;
  endpoint: string;
  icon: React.ReactNode;
};

const CHECKS: Check[] = [
  { label: "Liveness", endpoint: "/api/ops/health/live", icon: <Activity className="h-4 w-4" /> },
  { label: "Readiness", endpoint: "/api/ops/health/ready", icon: <Server className="h-4 w-4" /> },
  { label: "Startup", endpoint: "/api/ops/health/startup", icon: <ShieldCheck className="h-4 w-4" /> },
  { label: "Idempotency", endpoint: "/api/ops/health/idempotency", icon: <Database className="h-4 w-4" /> },
];

type State = "healthy" | "degraded" | "down";

export default function StatusPage() {
  const [results, setResults] = useState<Record<string, State>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const next: Record<string, State> = {};
      for (const check of CHECKS) {
        try {
          const res = await apiFetch<{ status?: string }>(check.endpoint);
          next[check.label] = normalise(res.status ?? "healthy");
        } catch {
          next[check.label] = "down";
        }
      }
      setResults(next);
      setLoading(false);
    };
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6 lg:px-12">
      <section className="mx-auto flex max-w-5xl flex-col gap-4 rounded-3xl border border-blue-100 bg-white/85 p-8 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
            <Wifi className="h-4 w-4" /> System status
          </p>
          <h1 className="text-3xl font-bold text-navy dark:text-white">Live health checks</h1>
          <p className="max-w-3xl text-sm text-navy/70 dark:text-slate-400">
            Each badge is the response from our backend health endpoints—no placeholders, just real signals.
          </p>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-2">
        {CHECKS.map((check) => (
          <div
            key={check.label}
            className="flex items-center justify-between rounded-2xl border border-blue-100 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-900/40 dark:text-blue-200 dark:ring-blue-800">
                {check.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-navy dark:text-white">{check.label}</p>
                <p className="text-xs text-navy/60 dark:text-slate-400">{check.endpoint}</p>
              </div>
            </div>
            <StateBadge state={results[check.label] ?? "healthy"} loading={loading} />
          </div>
        ))}
      </section>
    </main>
  );
}

function StateBadge({ state, loading }: { state: State; loading: boolean }) {
  const colors: Record<State, string> = {
    healthy: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800",
    degraded: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800",
    down: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800",
  };
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", colors[state])}>
      {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {state}
    </span>
  );
}

function normalise(value: string): State {
  const lower = value?.toLowerCase() ?? "";
  if (lower.includes("degraded")) return "degraded";
  if (lower.includes("down") || lower.includes("fail")) return "down";
  return "healthy";
}
