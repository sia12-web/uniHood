"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";

const PRIMARY_LINKS = [
  { href: "/social", label: "Overview" },
  { href: "/social/nearby", label: "Nearby" },
  { href: "/social/friends", label: "Friends" },
  { href: "/social/invitations", label: "Invitations" },
];

const SECONDARY_LINKS = [
  { href: "/match", label: "Smart matching" },
  { href: "/search", label: "Discovery search" },
  { href: "/proximity", label: "Open full map" },
];

function isActive(pathname: string, href: string) {
  if (href === "/social") {
    return pathname === "/social";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SocialHubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { hasNotification, acknowledge } = useFriendAcceptanceIndicator();
  const friendsHref = hasNotification ? "/social/friends?filter=pending" : "/social/friends";

  const activeMap = useMemo(() => {
    return PRIMARY_LINKS.reduce<Record<string, boolean>>((acc, link) => {
      acc[link.href] = isActive(pathname ?? "/social", link.href);
      return acc;
    }, {});
  }, [pathname]);

  useEffect(() => {
    if (activeMap["/social/friends"] && hasNotification) {
      acknowledge();
    }
  }, [acknowledge, activeMap, hasNotification]);

  const mobileLinks = PRIMARY_LINKS.map((link) => {
    const targetHref = link.href === "/social/friends" ? friendsHref : link.href;
    return (
      <Link
        key={`mobile-${link.href}`}
        href={targetHref}
        onClick={() => setMobileNavOpen(false)}
        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
          activeMap[link.href]
            ? "bg-midnight text-white shadow-soft"
            : "text-navy hover:bg-warm-sand/90 hover:text-midnight"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          {link.label}
          {link.href === "/social/friends" && hasNotification && !activeMap[link.href] ? (
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          ) : null}
        </span>
      </Link>
    );
  });

  const desktopLinks = PRIMARY_LINKS.map((link) => {
    const targetHref = link.href === "/social/friends" ? friendsHref : link.href;
    return (
      <Link
        key={link.href}
        href={targetHref}
        className={`rounded-full px-3 py-2 text-sm font-medium transition ${
          activeMap[link.href]
            ? "bg-midnight text-white shadow-soft"
            : "text-navy hover:bg-warm-sand/80 hover:text-midnight"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          {link.label}
          {link.href === "/social/friends" && hasNotification && !activeMap[link.href] ? (
            <span
              className="inline-flex h-2 w-2 rounded-full bg-emerald-500"
              aria-label="New friend accepted"
            />
          ) : null}
        </span>
      </Link>
    );
  });

  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 text-navy md:flex-row md:gap-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(77,208,225,0.18)_0%,_rgba(255,255,255,0)_65%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(255,209,102,0.16)_0%,_rgba(255,255,255,0)_70%)]" />
      <div className="relative md:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-3xl border border-warm-sand bg-glass px-4 py-3 text-left text-sm font-semibold shadow-soft"
        >
          <span>Social Hub</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            className={`h-4 w-4 transition ${mobileNavOpen ? "rotate-180" : "rotate-0"}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" />
          </svg>
        </button>
        {mobileNavOpen ? (
          <nav className="mt-3 flex flex-wrap gap-2 rounded-3xl border border-warm-sand bg-glass p-3 shadow-soft">
            {mobileLinks}
          </nav>
        ) : null}
      </div>

      <aside className="relative hidden w-full max-w-xs shrink-0 flex-col gap-6 rounded-3xl border border-warm-sand bg-glass p-6 shadow-soft md:flex">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Social hub</p>
          <h1 className="text-2xl font-semibold text-navy">Stay close to your campus circle</h1>
          <p className="text-sm text-navy/70">
            Switch between proximity, friends, and invites without leaving the hub. Each module keeps collaboration
            stress-free.
          </p>
        </header>
        <nav className="flex flex-col gap-1">{desktopLinks}</nav>
        <div className="mt-auto space-y-2 border-t border-warm-sand/60 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/50">More tools</p>
          <nav className="flex flex-col gap-1">
            {SECONDARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-2 text-sm font-medium text-navy/70 transition hover:bg-warm-sand/70 hover:text-midnight"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <section className="relative flex-1">
        {pathname !== "/social" ? null : (
          <header className="relative hidden flex-col gap-2 rounded-3xl border border-warm-sand bg-glass p-6 text-center shadow-soft md:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Social hub</p>
            <h1 className="text-xl font-semibold text-navy">Stay close to your campus circle</h1>
            <p className="text-sm text-navy/70">
              Switch between proximity, friends, and invites without leaving the hub.
            </p>
          </header>
        )}
        {children}
      </section>
    </main>
  );
}
