"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";


function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteHeader() {
  const pathname = usePathname() ?? "/";

  const suppressedPrefixes = [
    "/",
    "/contact",
    "/legal",
    "/privacy",
    "/terms",
    "/cookies",
    "/social",
    "/settings/profile",
    "/onboarding",
    "/friends",
    "/meetups",
    "/discovery",
    "/activities",
    "/chat",
    "/login",
    "/select-university",
    "/select-courses",
    "/set-profile",
    "/welcome",
    "/major-year",
    "/passions",
    "/photos",
    "/leaderboards",
  ];
  const shouldRenderHeader = !suppressedPrefixes.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!shouldRenderHeader || typeof window === "undefined") {
      return;
    }
    setHydrated(true);
  }, [shouldRenderHeader, pathname]);

  const navLinks = useMemo<Array<{ href: string; label: string }>>(() => {
    // Hide user name and profile link from the top bar; only show sign-in when logged out.
    return [];
  }, []);

  const visibleLinks = hydrated ? navLinks : [];

  const activeMap = useMemo(() => {
    return navLinks.reduce<Record<string, boolean>>((acc, link) => {
      acc[link.href] = isActive(pathname, link.href);
      return acc;
    }, {});
  }, [pathname, navLinks]);

  useEffect(() => {
    if (!shouldRenderHeader) {
      return;
    }
    setMenuOpen(false);
  }, [pathname, shouldRenderHeader]);

  if (!shouldRenderHeader) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-warm-sand dark:border-slate-700 bg-glass shadow-soft">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex h-full items-center">
          <div className="mr-6 rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-warm-sand/30">
            <BrandLogo withWordmark asLink logoClassName="h-10 w-auto" wordmarkTitleClassName="text-2xl" disableMixBlend={true} />
          </div>
        </div>
        <nav className="hidden items-center gap-1 md:flex">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${activeMap[link.href]
                ? "bg-midnight dark:bg-indigo-600 text-white shadow-soft"
                : "text-navy dark:text-slate-200 hover:bg-warm-sand/80 dark:hover:bg-slate-700 hover:text-midnight dark:hover:text-white"
                }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {/* Hide sign-out from the top bar as requested */}
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-warm-sand dark:border-slate-600 bg-cream dark:bg-slate-800 text-navy dark:text-slate-200 md:hidden"
        >
          <span className="sr-only">Toggle navigation</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </button>
      </div>
      {menuOpen ? (
        <div className="border-t border-warm-sand dark:border-slate-700 bg-cream dark:bg-slate-900 pb-4 pt-3 md:hidden">
          <nav className="flex flex-col gap-1 px-4">
            {visibleLinks.map((link) => (
              <Link
                key={`mobile-${link.href}`}
                href={link.href}
                className={`rounded px-3 py-2 text-sm font-medium ${activeMap[link.href]
                  ? "bg-midnight dark:bg-indigo-600 text-white"
                  : "text-navy dark:text-slate-200 hover:bg-warm-sand dark:hover:bg-slate-700 hover:text-midnight dark:hover:text-white"
                  }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          {/* Hide sign-out in mobile menu as well */}
        </div>
      ) : null}
    </header>
  );
}
