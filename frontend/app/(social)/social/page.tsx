import Link from "next/link";

import { FriendsSnapshot } from "@/components/social/FriendsSnapshot";

const OVERVIEW_CARDS = [
  {
    title: "Stay in touch",
    href: "/social/friends",
    description:
      "Check your accepted friends and quickly hop into their profiles. It’s the fastest way to reconnect IRL.",
  },
  {
    title: "Respond faster",
    href: "/social/invitations",
    description:
      "Triage invitations without switching contexts. See context, respond, or snooze in a couple of taps.",
  },
  {
    title: "Find who’s nearby",
    href: "/social/nearby",
    description:
      "Peek at the proximity map, spot shared interests, and coordinate study hangs before the moment passes.",
  },
  {
    title: "Explore matches",
    href: "/match",
    description:
      "Use Divan’s matching prompts to discover collaborators you haven’t met yet and break the ice confidently.",
  },
];

export default function SocialHubOverviewPage() {
  return (
    <div className="relative flex flex-col gap-8 text-navy">
      <section className="rounded-3xl border border-warm-sand bg-glass p-6 shadow-soft">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Part 1 · Social graph</p>
          <h2 className="text-3xl font-semibold text-navy">Coordinate your campus relationships</h2>
          <p className="max-w-3xl text-sm text-navy/70">
            The Social Hub keeps proximity, friends, and invitations under one roof. Jump in and out without losing
            your place, and grow your campus network at your own pace.
          </p>
        </header>
      </section>

      <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
        <section className="grid gap-4 sm:grid-cols-2">
          {OVERVIEW_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group flex flex-col gap-2 rounded-2xl border border-transparent bg-white/70 p-5 shadow-sm transition hover:-translate-y-1 hover:border-warm-sand hover:shadow-soft"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-coral/80">Shortcut</span>
              <h3 className="text-lg font-semibold text-navy">{card.title}</h3>
              <p className="text-sm text-navy/70">{card.description}</p>
              <span className="text-sm font-medium text-midnight group-hover:underline">Open section →</span>
            </Link>
          ))}
        </section>

        <FriendsSnapshot />
      </div>
    </div>
  );
}
