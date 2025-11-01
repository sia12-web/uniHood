import Link from "next/link";

import { getDemoActivityId } from "@/lib/env";

const demoIds = {
  rps: getDemoActivityId("rps"),
  story: getDemoActivityId("story"),
  trivia: getDemoActivityId("trivia"),
  typing: getDemoActivityId("typing"),
  with: getDemoActivityId("with"),
};

const ACTIVITY_HIGHLIGHTS = [
  {
    title: "Rock · Paper · Scissors",
    description:
      "Real-time duel game used in Part 2 calibration labs. Configure a demo match ID to explore the live socket flow.",
    demoId: demoIds.rps,
    pathPrefix: "/activities/rps/",
    envKey: "NEXT_PUBLIC_DEMO_RPS_ID",
  },
  {
    title: "Story Builder",
    description:
      "Collaborative storytelling prompts that help new connections break the ice and learn each other’s rhythms.",
    demoId: demoIds.story,
    pathPrefix: "/activities/story/",
    envKey: "NEXT_PUBLIC_DEMO_STORY_ID",
  },
  {
    title: "Trivia Sprint",
    description:
      "Fast trivia rounds with latency tracking. Reveal answers live to keep energy high while teammates compete.",
    demoId: demoIds.trivia,
    pathPrefix: "/activities/trivia/",
    envKey: "NEXT_PUBLIC_DEMO_TRIVIA_ID",
  },
  {
    title: "Typing Rally",
    description:
      "Short bursts of typing challenges calibrated to campus reading lists. Keeps sessions lively between deep work blocks.",
    demoId: demoIds.typing,
    pathPrefix: "/activities/typing/",
    envKey: "NEXT_PUBLIC_DEMO_TYPING_ID",
  },
  {
    title: "Paired Workflows",
    description:
      "Deep work mode for holding one-on-one accountability. Launch it directly from smart match results.",
    demoId: demoIds.with,
    pathPrefix: "/activities/with/",
    envKey: "NEXT_PUBLIC_DEMO_WITH_ID",
  },
];

export default function ActivitiesCatalogPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12 text-navy">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Part 2 · Activities</p>
        <h1 className="text-3xl font-bold text-navy">Preview the lightweight activity toolkit</h1>
        <p className="max-w-3xl text-sm text-navy/70">
          Each activity runs inside a room session with real-time updates from the backend. Use the sample URLs as a
          guide—replace the placeholder IDs with real ones from your development database once matches exist.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {ACTIVITY_HIGHLIGHTS.map((activity) => (
          <article
            key={activity.title}
            className="flex flex-col gap-3 rounded-2xl border border-warm-sand bg-white/90 p-5 shadow-sm"
          >
            <div>
              <h2 className="text-lg font-semibold text-navy">{activity.title}</h2>
              <p className="mt-1 text-sm text-navy/70">{activity.description}</p>
            </div>
            {activity.demoId ? (
              <>
                <div className="rounded border border-dashed border-warm-sand bg-cream px-3 py-2 text-xs text-navy/70">
                  <p className="font-semibold uppercase tracking-wide text-coral/80">Demo route</p>
                  <p>
                    <code>{`${activity.pathPrefix}${activity.demoId}`}</code>
                  </p>
                </div>
                <Link
                  href={`${activity.pathPrefix}${activity.demoId}`}
                  className="text-sm font-medium text-navy hover:text-midnight"
                >
                  Open demo activity →
                </Link>
              </>
            ) : (
              <div className="rounded border border-dashed border-coral/40 bg-amber-50 px-3 py-2 text-xs text-coral">
                <p className="font-semibold uppercase tracking-wide">Demo ID needed</p>
                <p>
                  Set <code>{activity.envKey}</code> in your <code>.env.local</code> to link directly into this activity.
                </p>
              </div>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
