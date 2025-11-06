"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import BrandLogo from "@/components/BrandLogo";
import { clearAuthSnapshot, onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const suppressedPrefixes = ["/", "/social", "/settings/profile", "/onboarding", "/login"];
  const shouldRenderHeader = !suppressedPrefixes.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!shouldRenderHeader || typeof window === "undefined") {
      return;
    }
    setAuthUser(readAuthUser());
    setHydrated(true);
    const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
    return () => {
      cleanup();
    };
  }, [shouldRenderHeader]);

  const navLinks = useMemo(() => {
    if (authUser) {
      const label = authUser.displayName?.trim()
        ? authUser.displayName
        : authUser.handle
        ? `@${authUser.handle}`
        : "Profile";
      return [{ href: "/me", label }];
    }
    return [{ href: "/login", label: "Sign in" }];
  }, [authUser]);

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

  const handleSignOut = useCallback(() => {
    clearAuthSnapshot();
    setAuthUser(null);
    setMenuOpen(false);
  }, []);

  if (!shouldRenderHeader) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-warm-sand bg-glass shadow-soft">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <BrandLogo withWordmark />
        <nav className="hidden items-center gap-1 md:flex">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                activeMap[link.href]
                  ? "bg-midnight text-white shadow-soft"
                  : "text-navy hover:bg-warm-sand/80 hover:text-midnight"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {hydrated && authUser ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="hidden rounded-full border border-warm-sand px-3 py-2 text-sm font-medium text-navy transition hover:bg-warm-sand/80 hover:text-midnight md:inline-flex"
          >
            Sign out
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-warm-sand bg-cream text-navy md:hidden"
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
        <div className="border-t border-warm-sand bg-cream pb-4 pt-3 md:hidden">
          <nav className="flex flex-col gap-1 px-4">
            {visibleLinks.map((link) => (
              <Link
                key={`mobile-${link.href}`}
                href={link.href}
                className={`rounded px-3 py-2 text-sm font-medium ${
                  activeMap[link.href]
                    ? "bg-midnight text-white"
                    : "text-navy hover:bg-warm-sand hover:text-midnight"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          {hydrated && authUser ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="mx-4 mt-3 rounded px-3 py-2 text-sm font-medium text-navy transition hover:bg-warm-sand hover:text-midnight"
            >
              Sign out
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
