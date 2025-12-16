"use client";

import { useEffect, useState } from "react";
import { BookOpen, Search, MessageCircle } from "lucide-react";
import Link from "next/link";
import type { CommunityGroup, GroupPost } from "@/lib/communities";
import { listGroups, listGroupPosts } from "@/lib/communities";

export default function HelpCenterPage() {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [articles, setArticles] = useState<GroupPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const gs = await listGroups({ limit: 6 });
        if (mounted) setGroups(gs);
        if (gs.length) {
          const posts = await listGroupPosts(gs[0].id, { limit: 6 });
          if (mounted) setArticles(posts.items ?? []);
        }
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
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6 lg:px-12">
      <section className="mx-auto flex max-w-6xl flex-col gap-4 rounded-3xl border border-slate-200 bg-white/85 p-8 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
              <BookOpen className="h-4 w-4" /> Help Center
            </p>
            <h1 className="text-3xl font-bold text-navy dark:text-white">Answers powered by your campus</h1>
            <p className="max-w-3xl text-sm text-navy/70 dark:text-slate-400">
              We surface articles and community threads directly from the backend communities service so you never hit a dead end.
            </p>
          </div>
          <Link
            href="/support"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-navy/20 transition hover:bg-midnight dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            Back to Support
          </Link>
        </div>
        <div className="relative mt-2 w-full max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            placeholder="Search campus groups for answers"
            className="w-full rounded-full border border-slate-200 bg-white px-10 py-3 text-sm text-navy placeholder:text-navy/40 shadow-sm focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-coral"
          />
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 p-10 text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-white" />
            <span className="ml-3 text-sm font-medium">Fetching knowledge base...</span>
          </div>
        ) : (
          <>
            {groups.map((group) => (
              <article
                key={group.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/80"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-navy/60 dark:text-slate-400">
                  <MessageCircle className="h-4 w-4 text-coral" />
                  {group.visibility === "public" ? "Public answers" : "Private group"}
                </div>
                <h3 className="text-lg font-semibold text-navy dark:text-white">{group.name}</h3>
                <p className="text-sm text-navy/70 dark:text-slate-400 line-clamp-3">{group.description}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {group.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                      {tag}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/communities/groups/${group.id}`}
                  className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-coral hover:underline"
                >
                  View threads
                </Link>
              </article>
            ))}
            {articles.map((post) => (
              <article
                key={post.id}
                className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-emerald-900/50 dark:bg-emerald-950/30"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                  From communities backend
                </p>
                <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-100">{post.title ?? "Community update"}</h3>
                <p className="text-sm text-emerald-900/80 dark:text-emerald-200 line-clamp-4">{post.body}</p>
              </article>
            ))}
          </>
        )}
      </section>

      <section className="mx-auto mt-8 max-w-6xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-navy dark:text-white">Still stuck?</h3>
            <p className="text-sm text-navy/70 dark:text-slate-400">
              Submit a ticket from the same contact endpoint our team monitors daily.
            </p>
          </div>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-coral/30 transition hover:bg-coral/90"
          >
            Contact Support
          </Link>
        </div>
      </section>
    </main>
  );
}
