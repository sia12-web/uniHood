import Link from "next/link";

const FEATURE_SECTIONS = [
  {
    title: "Identity & Onboarding (Part 1)",
    description:
      "Capture new students, guide them through email verification, and give them a place to manage their profile from day one.",
    links: [
      { href: "/onboarding", label: "Onboarding flow" },
      { href: "/login", label: "Login screen" },
      { href: "/verify", label: "Email verification wizard" },
      { href: "/settings/profile", label: "Profile settings" },
      { href: "/settings/privacy", label: "Privacy controls" },
    ],
  },
  {
    title: "Social Graph & Discovery (Part 1)",
    description:
      "Give students the tools to find each other: manage friend relationships, handle invites, and surface smart matches.",
    links: [
      { href: "/social", label: "Social overview" },
      { href: "/friends", label: "Friend manager" },
      { href: "/invites", label: "Invite inbox" },
      { href: "/match", label: "Smart matching" },
      { href: "/search", label: "Search & discovery" },
    ],
  },
  {
    title: "Rooms & Real-time Collaboration (Part 2)",
    description:
      "Spin up proximity-aware rooms, coordinate who should join, and keep conversations flowing with chat and proximity cues.",
    links: [
      { href: "/rooms", label: "Rooms hub" },
      { href: "/rooms/create", label: "Create a room" },
      { href: "/rooms/join", label: "Join existing rooms" },
      { href: "/proximity", label: "Proximity feed" },
      { href: "/chat", label: "Chat overview" },
    ],
  },
  {
    title: "Activities & Engagement (Part 2)",
    description:
      "Highlight lightweight activities, leaderboards, and streaks that keep the network lively and accountable.",
    links: [
      { href: "/activities", label: "Activity templates" },
      { href: "/leaderboards", label: "Leaderboards & streaks" },
      { href: "/stories", label: "Story prompts (coming soon)", disabled: true },
    ],
  },
  {
    title: "Trust, Safety & Administration (Part 2)",
    description:
      "Review policy gates, feature flags, RBAC, and verification pipelines run by campus operators.",
    links: [
      { href: "/admin", label: "Admin overview" },
      { href: "/consent", label: "Consent manager" },
      { href: "/flags", label: "Feature flags" },
      { href: "/rbac", label: "Roles & permissions" },
      { href: "/verification", label: "Verification review" },
    ],
  },
];

export default function FeaturesCatalogPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 text-navy">
      <header className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Feature map</p>
        <h1 className="text-3xl font-bold text-navy">Explore every Part 1 & Part 2 surface</h1>
        <p className="max-w-3xl text-sm text-navy/70">
          Use this map to jump into each screen we ship in the first two phases. Links route to fully scaffolded pages
          so product, design, and campus partners can preview the end-to-end experience without hunting through the file
          tree.
        </p>
      </header>

      {FEATURE_SECTIONS.map((section) => (
        <section key={section.title} className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-navy">{section.title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-navy/70">{section.description}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {section.links.map((link) => (
              <div
                key={link.label}
                className={`group flex flex-col gap-2 rounded-2xl border border-warm-sand bg-white/90 p-5 shadow-sm transition ${
                  link.disabled ? "opacity-60" : "hover:-translate-y-1 hover:shadow-soft"
                }`}
              >
                <h3 className="text-lg font-semibold text-navy">{link.label}</h3>
                <p className="text-xs uppercase tracking-wide text-navy/60">
                  {link.disabled ? "In design" : "Available now"}
                </p>
                {link.disabled ? (
                  <p className="text-sm text-navy/60">Preview coming in later phase.</p>
                ) : (
                  <Link
                    href={link.href}
                    className="text-sm font-medium text-navy group-hover:text-midnight"
                  >
                    Open screen →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
