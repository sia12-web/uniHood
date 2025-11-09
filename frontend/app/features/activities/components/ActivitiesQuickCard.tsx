"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { fetchMySummary } from "@/lib/leaderboards";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { MyLeaderboardSummary } from "@/lib/types";

const VARIANT_COPY: Record<Variant, VariantCopy> = {
  home: {
    eyebrow: "Mini activities",
    title: "Challenge a friend, earn points",
    body: "Typing duels and quick trivia now feed the campus leaderboard. Start a session and keep your streak alive.",
    primaryLabel: "Browse activities",
    primaryHref: "/activities",
    secondaryLabel: "View leaderboard",
    secondaryHref: "/leaderboards",
  },
  chat: {
    eyebrow: "Keep the momentum",
    title: "Spin up an activity from chat",
    body: "Kick off a duel without leaving the conversation. Recent wins and streak progress show up below.",
    primaryLabel: "Open activities",
    primaryHref: "/activities",
    secondaryLabel: "Leaderboard",
    secondaryHref: "/leaderboards",
  },
  friends: {
    eyebrow: "Friendly competition",
    title: "Invite a friend to play",
    body: "Activities now sync across Friends, Chat, and Home. Launch a quick match and climb the standings together.",
    primaryLabel: "Challenge a friend",
    primaryHref: "/activities",
    secondaryLabel: "Leaderboard",
    secondaryHref: "/leaderboards",
  },
};

type Variant = "home" | "chat" | "friends";

type VariantCopy = {
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

type ActivitiesQuickCardProps = {
  variant?: Variant;
  className?: string;
};

type LeaderboardState = {
  loading: boolean;
  summary: MyLeaderboardSummary | null;
  error: string | null;
};

function formatRank(rank: number | null | undefined): string {
  if (rank == null) {
    return "Unranked";
  }
  return `#${rank}`;
}

function formatScore(score: number | null | undefined): string {
  if (score == null) {
    return "0";
  }
  return score.toFixed(1);
}

function formatStreak(summary: MyLeaderboardSummary | null): string {
  if (!summary) {
    return "0 days";
  }
  const { current } = summary.streak;
  if (!current) {
    return "0 days";
  }
  return `${current} day${current === 1 ? "" : "s"}`;
}

export function ActivitiesQuickCard({ variant = "home", className }: ActivitiesQuickCardProps) {
  const copy = VARIANT_COPY[variant];
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<LeaderboardState>({ loading: true, summary: null, error: null });

  useEffect(() => {
    setAuthUser(readAuthUser());
    const unsubscribe = onAuthChange(() => {
      setAuthUser(readAuthUser());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const userId = authUser?.userId ?? getDemoUserId();
    const campusId = authUser?.campusId ?? getDemoCampusId();

    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchMySummary({ userId, campusId, signal: controller.signal })
      .then((summary) => {
        setState({ loading: false, summary, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setState({ loading: false, summary: null, error: err instanceof Error ? err.message : "Unable to load summary" });
      });

    return () => controller.abort();
  }, [authUser?.userId, authUser?.campusId]);

  const highlightStats = useMemo(() => {
    const { summary } = state;
    return [
      {
        label: "Daily rank",
        value: formatRank(summary?.ranks?.overall ?? null),
      },
      {
        label: "Overall score",
        value: formatScore(summary?.scores?.overall ?? null),
      },
      {
        label: "Streak",
        value: formatStreak(summary),
      },
    ];
  }, [state]);

  return (
    <section
      className={clsx(
        "rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur",
        "flex flex-col gap-3",
        className,
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-500">{copy.eyebrow}</span>
      <h2 className="text-xl font-semibold text-slate-900">{copy.title}</h2>
      <p className="text-sm text-slate-600">{copy.body}</p>

      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {highlightStats.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-600"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
            {state.loading ? (
              <div className="mt-1 h-5 w-16 animate-pulse rounded bg-slate-200" />
            ) : (
              <p className="mt-1 text-base font-semibold text-slate-900">{item.value}</p>
            )}
          </div>
        ))}
      </div>

      {state.error ? (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {state.error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link
          href={copy.primaryHref}
          className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 font-semibold text-white shadow transition hover:bg-sky-500"
          prefetch={false}
        >
          {copy.primaryLabel}
        </Link>
        <Link
          href={copy.secondaryHref}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          prefetch={false}
        >
          {copy.secondaryLabel}
        </Link>
      </div>
    </section>
  );
}

export default ActivitiesQuickCard;
