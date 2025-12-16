import type { Metadata } from "next";
import { Compass, Radio, Sparkles } from "lucide-react";
import { FeedView } from "@/components/communities/feed/feed-view";
import type { CurrentUser } from "@/lib/auth-guard";
import { requireCurrentUser } from "@/lib/auth-guard";

export const metadata: Metadata = {
  title: "Community Feed",
  description: "Live campus updates powered by the communities backend feed.",
};

export default async function CommunityFeedPage() {
  const currentUser: CurrentUser = await requireCurrentUser();

  return (
    <main className="min-h-screen bg-gradient-to-b from-cream via-white to-slate-50 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6 lg:px-10">
      <section className="mx-auto flex max-w-6xl flex-col gap-4 rounded-3xl border border-warm-sand/50 bg-white/80 p-8 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-coral/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-coral">
              <Sparkles className="h-4 w-4" /> Campus feed
            </p>
            <h1 className="text-3xl font-bold text-navy dark:text-white">Community Feed</h1>
            <p className="text-sm text-navy/70 dark:text-slate-400">
              Pulls directly from the communities service with live reactions, comments, and new posts as they land.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-navy/60 dark:text-slate-400">
            <Badge icon={<Compass className="h-3.5 w-3.5" />} label="Personalized" />
            <Badge icon={<Radio className="h-3.5 w-3.5" />} label="Realtime" />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl">
        <FeedView
          scope={{ type: "user" }}
          currentUser={currentUser}
          header="Your campus feed"
          description="Posts stream in from your groups and classmates. Reactions and comments update in real time from the backend."
        />
      </section>
    </main>
  );
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warm-sand/70 px-3 py-1 dark:border-slate-700">
      <span className="text-coral">{icon}</span>
      {label}
    </span>
  );
}
