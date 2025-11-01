import Link from "next/link";

import { FriendsSnapshot } from "@/components/social/FriendsSnapshot";

const FRIEND_ACTIONS = [
  {
    title: "Accepted friends",
    description: "Review your roster and jump into DMs or room invites without rummaging through menus.",
  },
  {
    title: "Pending requests",
    description: "Keep tabs on who&apos;s asked to connect and respond when you&apos;re ready to collaborate.",
  },
  {
    title: "Boundaries & blocks",
    description: "Set healthy limits. Block or unblock classmates while keeping context about previous chats.",
  },
];

export default function SocialFriendsPage() {
  return (
    <div className="relative flex flex-col gap-8 text-navy">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Module · Friends</p>
        <h2 className="text-3xl font-semibold text-navy">Keep your closest collaborators in view</h2>
        <p className="max-w-3xl text-sm text-navy/70">
          Use the friends module to track who you already trust on campus. Organise invites, check mutuals, and turn
          quick hellos into recurring study sessions.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
        <article className="space-y-4 rounded-3xl border border-warm-sand bg-glass p-6 shadow-soft">
          <h3 className="text-lg font-semibold text-navy">What you can manage</h3>
          <ul className="space-y-3 text-sm text-navy/70">
            {FRIEND_ACTIONS.map((item) => (
              <li key={item.title} className="rounded-2xl bg-cream px-4 py-3">
                <strong className="block text-navy">{item.title}</strong>
                <span>{item.description}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/friends"
              className="rounded-full bg-midnight px-5 py-2 text-sm font-semibold text-white transition hover:bg-navy"
            >
              Open friends manager
            </Link>
            <Link
              href="/settings/profile"
              className="rounded-full border border-warm-sand px-5 py-2 text-sm font-semibold text-navy transition hover:bg-warm-sand hover:text-midnight"
            >
              Update profile details
            </Link>
          </div>
        </article>

        <FriendsSnapshot />
      </div>
    </div>
  );
}
