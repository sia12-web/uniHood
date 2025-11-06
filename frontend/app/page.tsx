"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
import { clearAuthSnapshot, onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { isRecentlyLive } from "@/lib/presence/api";

const NAV_LINKS = [
  { href: "/social/nearby", label: "Social Hub" },
  { href: "/settings/profile", label: "Profile" },
  { href: "/rooms", label: "Rooms" },
  { href: "/friends", label: "Friends" },
];

export default function HomePage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [liveNow, setLiveNow] = useState(false);
  const GO_LIVE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GO_LIVE === "true";

  useEffect(() => {
    setAuthUser(readAuthUser());
    const unsubscribe = onAuthChange(() => {
      setAuthUser(readAuthUser());
    });
    setHydrated(true);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!GO_LIVE_ENABLED) {
      setLiveNow(false);
      return;
    }
    const update = () => setLiveNow(isRecentlyLive());
    update();
    const id = window.setInterval(update, 15000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "divan:lastHeartbeatAt") update();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [GO_LIVE_ENABLED]);

  const handleSignOut = useCallback(() => {
    clearAuthSnapshot();
    setAuthUser(null);
  }, []);

  const profileLink = useMemo(() => {
    if (!authUser) {
      return null;
    }
    return authUser.handle ? `/u/${authUser.handle}` : "/settings/profile";
  }, [authUser]);

  return (
    <main className="relative flex min-h-screen flex-col bg-aurora">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(77,208,225,0.28)_0%,_rgba(255,255,255,0)_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(255,209,102,0.25)_0%,_rgba(255,255,255,0)_60%)]" />
      <header className="relative border-b border-warm-sand/70 bg-glass shadow-soft">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <BrandLogo withWordmark />
          <nav className="hidden items-center gap-4 rounded-full bg-white/60 px-4 py-2 text-sm font-medium text-navy/70 shadow-sm md:flex">
            {(hydrated && authUser ? NAV_LINKS : hydrated ? NAV_LINKS.filter((item) => item.href === "/social/nearby") : []).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1 transition hover:bg-white/80 hover:text-midnight"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {hydrated && authUser ? (
              <>
                <Link
                  href={profileLink ?? "/settings/profile"}
                  className="rounded-full border border-warm-sand px-4 py-2 text-sm font-semibold text-navy transition hover:bg-warm-sand hover:text-midnight"
                >
                  {authUser.displayName?.trim()
                    ? authUser.displayName
                    : authUser.handle
                    ? `@${authUser.handle}`
                    : "Profile"}
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy"
                >
                  Sign out
                </button>
              </>
            ) : hydrated ? (
              <>
                <Link
                  href="/onboarding"
                  className="rounded-full border border-warm-sand px-4 py-2 text-sm font-semibold text-navy transition hover:bg-warm-sand hover:text-midnight"
                >
                  Join beta
                </Link>
                <Link
                  href="/login"
                  className="rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy"
                >
                  Sign in
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <section className="relative flex flex-1 items-center justify-center px-4 py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.45)_0%,_rgba(255,255,255,0)_70%)]" />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-12 text-center">
          <div className="flex flex-col items-center gap-6">
            <div className="relative w-48 max-w-full aspect-[3/4] sm:w-64">
              <div className="pointer-events-none absolute -inset-6 rounded-[40px] bg-gradient-to-tr from-coral/40 via-white/40 to-aqua/30 blur-3xl" />
              <div className="relative h-full w-full overflow-hidden rounded-[32px] border border-warm-sand/80 bg-white/90 shadow-soft ring-1 ring-inset ring-white/50">
                <Image
                  src="/brand/divan-logo.jpg"
                  alt="Divan mascot wearing a graduation cap"
                  fill
                  priority
                  className="object-contain"
                />
              </div>
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-navy sm:text-5xl">Divan</h1>
              <p className="mx-auto max-w-2xl text-lg text-navy/70">
                A brighter, calmer way to find friends around campus. Drop into the spaces that matter without the
                noise, and let Divan highlight the connections worth nurturing.
              </p>
            </div>
          </div>

          <article className="w-full rounded-3xl border border-warm-sand bg-glass p-6 text-left shadow-soft">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-coral">Now open</p>
                <h2 className="text-2xl font-semibold text-navy">Social Hub</h2>
              </div>
              {hydrated ? (
                <Link
                  href={authUser ? "/social/nearby" : "/onboarding"}
                  className="w-fit rounded-full bg-midnight px-6 py-2 text-sm font-semibold text-white shadow-soft transition hover:scale-[1.02] hover:bg-navy"
                >
                  {authUser ? "Open the hub" : "See who\'s nearby"}
                </Link>
              ) : null}
            </header>
            <p className="mt-4 text-sm text-navy/70">
              Tap into verified classmates who are within walking distance. Chill in the lounge, share what you&apos;re
              working on, and send quick invites when you&apos;re ready to collaborate.
            </p>
            <ul className="mt-6 grid gap-3 text-sm text-navy/80 sm:grid-cols-2">
              <li className="rounded-2xl border border-transparent bg-white/60 px-4 py-3 shadow-sm transition hover:border-warm-sand">
                <strong className="block text-navy">Live proximity map</strong>
                See active peers and shared interests at a glance.
              </li>
              <li className="rounded-2xl border border-transparent bg-white/60 px-4 py-3 shadow-sm transition hover:border-warm-sand">
                <strong className="block text-navy">Quick invites</strong>
                Send a friendly wave or suggest an instant meet-up.
              </li>
              <li className="rounded-2xl border border-transparent bg-white/60 px-4 py-3 shadow-sm transition hover:border-warm-sand sm:col-span-2">
                <strong className="block text-navy">Keep it relaxed</strong>
                No clutter—just the essentials to meet, sync, and make new campus friends.
              </li>
            </ul>
          </article>

          {/* Proximity CTA: lightweight and safe */}
          <article className="w-full rounded-3xl border border-warm-sand/70 bg-white/70 p-6 text-left shadow-soft">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Try it</p>
                <h2 className="text-2xl font-semibold text-navy">
                  Proximity
                  {GO_LIVE_ENABLED ? (
                    <span className="ml-2 align-middle rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {liveNow ? "Live now" : "Go Live available"}
                    </span>
                  ) : null}
                </h2>
              </div>
              {hydrated ? (
                <Link
                  href={authUser ? "/proximity" : "/onboarding"}
                  className="w-fit rounded-full bg-emerald-700 px-6 py-2 text-sm font-semibold text-white shadow-soft transition hover:scale-[1.02] hover:bg-emerald-800"
                >
                  {authUser ? "Open proximity" : "Get started"}
                </Link>
              ) : null}
            </header>
            <p className="mt-4 text-sm text-navy/70">
              See classmates who are within a short walk. Tune your discovery radius and send quick invites when the
              timing is right.
            </p>
          </article>

          <p className="text-xs uppercase tracking-[0.3em] text-navy/40">More spaces coming soon</p>
        </div>
      </section>
    </main>
  );
}
