import Link from "next/link";

import { getDemoHandle } from "@/lib/env";

const demoHandle = getDemoHandle();

type ProfileSurface = {
  title: string;
  description: string;
  href: string | null;
  envKey?: string;
};

const PROFILE_SURFACES: ProfileSurface[] = [
  {
    title: "Public profile showcase",
    href: demoHandle ? `/u/${demoHandle}` : null,
    description:
      "See how verified students present themselves externally. Update NEXT_PUBLIC_DEMO_HANDLE to stage a sample profile.",
    envKey: "NEXT_PUBLIC_DEMO_HANDLE",
  },
  {
    title: "Profile settings",
    href: "/settings/profile",
    description:
      "Update avatar, bio, and collaboration preferences. Changes propagate instantly across the network.",
  },
  {
    title: "Privacy controls",
    href: "/settings/privacy",
    description:
      "Toggle ghost mode, fine-tune visibility, and manage how discoverable you are across Part 1 flows.",
  },
  {
    title: "Linked accounts",
    href: "/settings/accounts",
    description:
      "Connect campus SSO or consumer identity providers to speed up sign-in and strengthen trust signals.",
  },
  {
    title: "Security dashboard",
    href: "/settings/security",
    description:
      "Rotate passwords, manage passkeys, download recovery codes, and review trusted devices when necessary.",
  },
];

export default function ProfilesHubPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12 text-navy">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Part 1 · Identity surfaces</p>
        <h1 className="text-3xl font-bold text-navy">Profile tools across the stack</h1>
        <p className="max-w-3xl text-sm text-navy/70">
          Everything here reinforces the authenticated identity layer introduced in Part 1. Use these links to stage
          walkthroughs or QA flows before launch.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {PROFILE_SURFACES.map((surface) => {
          const content = (
            <>
              <h2 className="text-lg font-semibold text-navy">{surface.title}</h2>
              <p className="text-sm text-navy/70">{surface.description}</p>
            </>
          );
          if (surface.href) {
            return (
              <Link
                key={surface.title}
                href={surface.href}
                className="group flex flex-col gap-2 rounded-2xl border border-warm-sand bg-white/90 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-soft"
              >
                {content}
                <span className="text-sm font-medium text-navy group-hover:text-midnight">Open screen →</span>
              </Link>
            );
          }
          return (
            <article
              key={surface.title}
              className="flex flex-col gap-2 rounded-2xl border border-coral/40 bg-amber-50 p-5 text-sm text-coral"
            >
              {content}
              <span>
                Configure <code>{surface.envKey}</code> in <code>.env.local</code> to deep-link into this showcase.
              </span>
            </article>
          );
        })}
      </section>
    </main>
  );
}
