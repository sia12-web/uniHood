import Link from "next/link";

const INVITE_STEPS = [
  {
    title: "Filter by status",
    description: "Jump between new, accepted, or archived invites to keep your plate organised.",
  },
  {
    title: "Respond with context",
    description: "See shared classes, passions, or mutual friends before you accept or decline.",
  },
  {
    title: "Schedule nudges",
    description: "Drop a quick follow-up or suggest a time that works—without leaving the hub.",
  },
];

export default function SocialInvitationsPage() {
  return (
    <div className="relative flex flex-col gap-8 text-navy">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Module · Invitations</p>
        <h2 className="text-3xl font-semibold text-navy">Stay on top of collab requests</h2>
        <p className="max-w-3xl text-sm text-navy/70">
          The invitation inbox keeps requests actionable and calm. Prioritise the ones that matter, park the ones that
          don&apos;t, and keep momentum across busy weeks.
        </p>
      </header>

  <article className="rounded-3xl border border-warm-sand bg-glass p-6 shadow-soft">
        <h3 className="text-lg font-semibold text-navy">Workflow highlights</h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {INVITE_STEPS.map((step) => (
            <li key={step.title} className="rounded-2xl border border-transparent bg-white/70 px-4 py-3 shadow-sm transition hover:border-warm-sand">
              <strong className="block text-navy">{step.title}</strong>
              <span className="text-sm text-navy/70">{step.description}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/invites"
            className="rounded-full bg-midnight px-5 py-2 text-sm font-semibold text-white transition hover:bg-navy"
          >
            Review invites
          </Link>
          <Link
            href="/friends"
            className="rounded-full border border-warm-sand px-5 py-2 text-sm font-semibold text-navy transition hover:bg-warm-sand hover:text-midnight"
          >
            Manage friends list
          </Link>
        </div>
      </article>
    </div>
  );
}
