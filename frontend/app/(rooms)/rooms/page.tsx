import Link from "next/link";

const ROOM_GUIDES = [
  {
    title: "Launch a themed session",
    description: "Pick a topic, gate access by campus or invite, and set expectations before members join.",
    href: "/rooms/create",
    action: "Create",
  },
  {
    title: "Join an in-progress room",
    description: "Browse live audio, video, or chat rooms hosted by classmates within your proximity radius.",
    href: "/rooms/join",
    action: "Browse",
  },
  {
    title: "Replay highlights",
    description: "Review recordings, notes, and follow-up tasks so momentum continues after the session wraps.",
    href: "/rooms/join",
    action: "Replay",
  },
];

const ROOM_TIPS = [
  {
    title: "Breakout templates",
    body: "Use the matching prompts from Part 2 to split large rooms into focused working groups without losing context.",
  },
  {
    title: "Proximity signals",
    body: "Layers in geofenced alerts so nearby friends can join instantly when a room hits capacity or needs more energy.",
  },
  {
    title: "Replays",
    body: "Save recordings with timestamps, then share highlight reels through invites or your public profile.",
  },
];

export default function RoomsHubPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Rooms hub</p>
        <h1 className="text-3xl font-bold text-slate-900">Coordinate real-time collaboration spaces</h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Rooms stitch together audio, chat, and prompts so cross-functional student teams can move ideas forward.
          Start fast with templates, or adapt replays and notes to keep the momentum going across study sessions.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {ROOM_GUIDES.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="flex items-center justify-between text-sm font-semibold text-slate-500">
              <span>{guide.action}</span>
              <span className="text-xs uppercase tracking-wide text-slate-400">Room</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{guide.title}</h2>
            <p className="text-sm text-slate-600">{guide.description}</p>
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Go to {guide.action} →</span>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-xl font-semibold text-slate-900">Make every room session count</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Combine the best of parts 1 and 2 — verified rosters, smart matching, and proximity — to ship sessions that
          feel intentional instead of ad-hoc. Keep these best practices in play while you host.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {ROOM_TIPS.map((tip) => (
            <article key={tip.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{tip.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{tip.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
