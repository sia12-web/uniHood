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
  tag?: string;
};

const CATALOG: CatalogItem[] = [
  {
    key: "speed_typing",
    title: "Speed Typing Duel",
    blurb: "Race head-to-head to finish the sample with accuracy.",
    available: true,
    href: "/activities/speed_typing",
    img: "/activities/speedtyping.svg",
    tag: "Live duel",
  },
  {
    key: "quick_trivia",
    title: "Quick Trivia",
    blurb: "Rapid questions. Earn points for correctness and speed.",
    available: true,
    href: "/activities/quick_trivia",
    img: "/activities/trivia.svg",
    tag: "PvP",
  },
  {
    key: "rps",
    title: "Rock / Paper / Scissors",
    blurb: "Real-time duel game used in earlier calibration labs.",
    available: true,
    href: "/activities/rock_paper_scissors",
    img: "/activities/rps.svg",
    tag: "Classic",
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
    <main className="relative min-h-screen overflow-hidden bg-[#0c0b16] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,182,193,0.16),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(79,70,229,0.2),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-5">
        <Image src="/brand/realLogo-divan.jpg" alt="Divan background" fill className="object-cover" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-12">
        <header className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-rose-200">Activities</p>
          <h1 className="text-4xl font-bold leading-tight text-white">Jump into a game window right from the hub</h1>
          <p className="text-sm text-rose-100/80">
            Every activity now opens from a window-style preview with your familiar Divan backdrop. Click any window to launch
            the experience instantly.
          </p>
        </header>

        <section className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {CATALOG.map((item) => {
            const highlight = (item.key === "speed_typing" && hasPendingSpeedTypingInvite) ||
              (item.key === "quick_trivia" && hasPendingQuickTriviaInvite) ||
              (item.key === "rps" && hasPendingRpsInvite);
            const content = (
              <article
                key={item.key}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl ring-1 ring-white/10 transition hover:-translate-y-1 hover:shadow-2xl hover:ring-rose-200/40"
              >
                <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
                  <span className="flex gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-rose-50/80">Preview</span>
                  {item.tag ? (
                    <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-rose-50/90">
                      {item.tag}
                    </span>
                  ) : null}
                  {highlight ? (
                    <span className="ml-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                      Session waiting
                    </span>
                  ) : null}
                  {!item.available && (
                    <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                      Coming soon
                    </span>
                  )}
                </div>

                <div
                  className="relative h-52 overflow-hidden bg-gradient-to-br from-rose-200/20 via-indigo-500/10 to-slate-900/30"
                  style={{
                    backgroundImage: item.img
                      ? `linear-gradient(120deg, rgba(255, 255, 255, 0.06), rgba(12, 11, 22, 0.9)), url(${item.img})`
                      : undefined,
                    backgroundSize: item.img ? "cover" : undefined,
                    backgroundPosition: "center",
                  }}
                >
                  {item.img ? (
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c0b16] via-transparent to-transparent" />
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 px-4 py-4">
                  <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                  <p className="text-sm text-rose-50/70">{item.blurb}</p>
                  <div className="flex items-center gap-2 text-[11px] text-rose-50/80">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 font-semibold text-white">You</span>
                    <span className="text-rose-100/60">+</span>
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/20 font-semibold text-emerald-100">
                      Friend
                    </span>
                    <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/15">
                      2 players
                    </span>
                  </div>
                  <div className="pt-1">
                    <span
                      className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        item.available && item.href
                          ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 hover:bg-rose-400"
                          : "cursor-not-allowed bg-white/10 text-white/50"
                      }`}
                    >
                      {item.available && item.href ? (highlight ? "Join pending session" : "Open activity window") : "Coming soon"}
                    </span>
                  </div>
                </div>
              </article>
            );

            if (!item.available || !item.href) {
              return <div key={item.key} aria-disabled className="opacity-70">{content}</div>;
            }

            return (
              <Link key={item.key} href={item.href} className="focus:outline-none focus:ring-2 focus:ring-rose-200 focus:ring-offset-2 focus:ring-offset-[#0c0b16]">
                {content}
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
