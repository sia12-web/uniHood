"use client";

import { useEffect, useMemo, useState } from "react";
import { ShoppingBag, Tag, Users, Sparkles, Search } from "lucide-react";
import type { CommunityGroup } from "@/lib/communities";
import { listGroups } from "@/lib/communities";
import { cn } from "@/lib/utils";

export default function StudentMarketPage() {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listGroups({ limit: 24 });
        if (mounted) setGroups(data);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load student market listings.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(q) ||
        group.description.toLowerCase().includes(q) ||
        group.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [groups, query]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6 lg:px-12">
      <section className="mx-auto flex max-w-6xl flex-col gap-4 rounded-3xl border border-emerald-100 bg-white/85 p-8 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200">
              <ShoppingBag className="h-4 w-4" /> Student market
            </p>
            <h1 className="text-3xl font-bold text-navy dark:text-white">Trade gear, notes, and services</h1>
            <p className="max-w-3xl text-sm text-navy/70 dark:text-slate-400">
              Listings come straight from community groups—tap into campus swaps, tutoring circles, and creative collabs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-navy/60 dark:text-slate-400">
            <Badge label="Backend-powered" />
            <Badge label="Campus-first" />
          </div>
        </div>

        <div className="relative mt-2 w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-emerald-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, tag, or description"
            className="w-full rounded-full border border-emerald-100 bg-white px-10 py-3 text-sm text-navy placeholder:text-navy/40 shadow-sm focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-coral"
          />
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-emerald-100 bg-white/80 p-10 text-emerald-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-emerald-200">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600 dark:border-slate-700 dark:border-t-emerald-400" />
            <span className="ml-3 text-sm font-medium">Loading live listings...</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-semibold">Couldn&apos;t reach the market service</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((group) => (
              <div
                key={group.id}
                className="flex h-full flex-col gap-3 rounded-2xl border border-emerald-100 bg-white/90 p-5 shadow-md transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                      <Sparkles className="h-4 w-4" />
                      {group.visibility === "public" ? "Open" : "Private"}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-navy dark:text-white line-clamp-1">{group.name}</h3>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                    {group.tags?.[0] ?? "campus"}
                  </span>
                </div>
                <p className="text-sm text-navy/70 dark:text-slate-400 line-clamp-3">{group.description}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {group.tags?.length
                    ? group.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800"
                        >
                          <Tag className="h-3 w-3" />
                          {tag}
                        </span>
                      ))
                    : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                        <Tag className="h-3 w-3" />
                        campus
                      </span>
                    )}
                </div>
                <div className="mt-auto flex items-center gap-2 rounded-xl border border-emerald-100 px-3 py-2 text-sm font-semibold text-navy/70 dark:border-slate-800 dark:text-slate-200">
                  <Users className="h-4 w-4 text-emerald-500" />
                  <span>Tap into this group to trade or share resources.</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-2xl border border-emerald-100 bg-white/80 p-6 text-sm text-navy/70 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                No matching groups. Try a different keyword like &quot;tutoring&quot; or &quot;gear&quot;.
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-emerald-200 px-3 py-1 dark:border-slate-700">{label}</span>
  );
}
