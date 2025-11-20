"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { useTypingDuelInvite } from "@/hooks/activities/use-typing-duel-invite";
import { useQuickTriviaInvite } from "@/hooks/activities/use-quick-trivia-invite";
import { useRockPaperScissorsInvite } from "@/hooks/activities/use-rock-paper-scissors-invite";

type CatalogItem = {
  key: string;
  title: string;
  blurb: string;
  available: boolean;
  href?: string;
  img?: string;
};

const CATALOG: CatalogItem[] = [
  {
    key: "speed_typing",
    title: "Speed Typing Duel",
    blurb: "Race head-to-head to finish the sample with accuracy.",
    available: true,
    href: "/activities/speed_typing",
    img: "/activities/speedtyping.svg",
  },
  {
    key: "quick_trivia",
    title: "Quick Trivia",
    blurb: "Rapid questions. Earn points for correctness and speed.",
    available: true,
    href: "/activities/quick_trivia",
    img: "/activities/trivia.svg",
  },
  {
    key: "rps",
    title: "Rock / Paper / Scissors",
    blurb: "Real-time duel game used in earlier calibration labs.",
    available: true,
    href: "/activities/rock_paper_scissors",
    img: "/activities/rps.svg",
  },
  {
    key: "story",
    title: "Story Builder",
    blurb: "Collaborative prompts to break the ice and learn rhythms.",
    available: false,
  },
  {
    key: "with",
    title: "Paired Workflows",
    blurb: "One-on-one accountability mode for deep work sessions.",
    available: false,
  },
];

export default function ActivitiesHub() {
  const { invite } = useTypingDuelInvite();
  const { invite: triviaInvite } = useQuickTriviaInvite();
  const { invite: rpsInvite } = useRockPaperScissorsInvite();
  const hasPendingSpeedTypingInvite = useMemo(() => Boolean(invite), [invite]);
  const hasPendingQuickTriviaInvite = useMemo(() => Boolean(triviaInvite), [triviaInvite]);
  const hasPendingRpsInvite = useMemo(() => Boolean(rpsInvite), [rpsInvite]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Activities</p>
        <h1 className="text-3xl font-bold text-navy">Preview the lightweight activity toolkit</h1>
        <p className="max-w-3xl text-sm text-navy/70">
          Each activity runs inside a room session with real-time updates from the backend. Start a quick duel with a
          friend, or explore what is coming next.
        </p>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOG.map((item) => {
          const highlight = (item.key === "speed_typing" && hasPendingSpeedTypingInvite) ||
            (item.key === "quick_trivia" && hasPendingQuickTriviaInvite) ||
            (item.key === "rps" && hasPendingRpsInvite);
          return (
            <article
              key={item.key}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                {item.img ? (
                  <Image src={item.img} alt={item.title} fill className="object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-slate-400">{item.title}</div>
                )}
                {!item.available && (
                  <span className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Coming soon
                  </span>
                )}
                {highlight ? (
                  <span className="absolute left-3 top-3 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
                    Session waiting
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col p-4">
                <h2 className="text-base font-semibold text-navy">{item.title}</h2>
                <p className="mt-1 text-xs text-navy/70">{item.blurb}</p>

                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-700">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-sky-100 font-semibold text-sky-700">You</span>
                  <span className="text-slate-400">+</span>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-700">Friend</span>
                  <span className="ml-auto rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">2 players</span>
                </div>
                <div className="mt-4">
                  {item.available && item.href ? (
                    <Link
                      href={item.href}
                      className={`inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow focus:outline-none focus:ring-2 focus:ring-sky-300 ${highlight ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-sky-600 text-white hover:bg-sky-500"}`}
                    >
                      {highlight ? "Join pending session" : "Start with a friend"}
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
                    >
                      Coming soon
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
