import Link from "next/link";

const NEARBY_HIGHLIGHTS = [
  {
    title: "Live proximities",
    description: "See classmates within your chosen radius with shared interests surfaced by default.",
  },
  {
    title: "Friendly invites",
    description: "Send a wave, drop a quick note, or spin up a study hang without leaving the map view.",
  },
  {
    title: "Privacy-aware",
    description: "Control ghost mode, adjust your visible radius, and decide who can find you at any time.",
  },
];

export default function SocialNearbyPage() {
  return (
    <div className="relative flex flex-col gap-8 text-navy">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Module · Proximity</p>
        <h2 className="text-3xl font-semibold text-navy">See who&apos;s within reach</h2>
        <p className="max-w-3xl text-sm text-navy/70">
          Divan&apos;s proximity layer helps you spot nearby collaborators in seconds. Filter by radius, view shared
          tags, and decide whether to reach out or stay in stealth mode.
        </p>
      </header>

  <article className="rounded-3xl border border-warm-sand bg-glass p-6 shadow-soft">
        <h3 className="text-lg font-semibold text-navy">How it works</h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {NEARBY_HIGHLIGHTS.map((item) => (
            <li key={item.title} className="rounded-2xl border border-transparent bg-white/70 px-4 py-3 shadow-sm transition hover:border-warm-sand">
              <strong className="block text-navy">{item.title}</strong>
              <span className="text-sm text-navy/70">{item.description}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/proximity"
            className="rounded-full bg-midnight px-5 py-2 text-sm font-semibold text-white transition hover:bg-navy"
          >
            Open live map
          </Link>
          <Link
            href="/settings/privacy"
            className="rounded-full border border-warm-sand px-5 py-2 text-sm font-semibold text-navy transition hover:bg-warm-sand hover:text-midnight"
          >
            Adjust visibility
          </Link>
        </div>
      </article>

  <section className="rounded-3xl border border-warm-sand bg-glass p-6 shadow-soft">
        <h3 className="text-lg font-semibold text-navy">Quick tips</h3>
        <ul className="mt-4 space-y-2 text-sm text-navy/70">
          <li>• Keep your passions list fresh—shared interests bubble to the top of the map.</li>
          <li>• Update your radius when you switch study spots so friends see accurate distances.</li>
          <li>• Ghost mode is perfect for deep-work sessions; toggle it off when you&apos;re ready to socialize.</li>
        </ul>
      </section>
    </div>
  );
}
