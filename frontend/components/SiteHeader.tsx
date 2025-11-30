"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

import BrandLogo from "@/components/BrandLogo";
import { readAuthSnapshot } from "@/lib/auth-storage";
import { fetchProfile, listCampuses } from "@/lib/identity";

const MCGILL_ID = "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2";

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteHeader() {
  const pathname = usePathname() ?? "/";

  const transparentLogoPrefixes = ["/chat", "/friends", "/activities", "/meetups"];
  const logoBackgroundTone = transparentLogoPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
    ? "transparent"
    : "light";
  const suppressedPrefixes = [
    "/",
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
  ];
  const shouldRenderHeader = !suppressedPrefixes.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [campusLogoSrc, setCampusLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldRenderHeader || typeof window === "undefined") {
      return;
    }
    setHydrated(true);

    const loadCampus = async () => {
      try {
        const auth = readAuthSnapshot();
        if (!auth?.user_id) return;

        let cid: string | null | undefined = auth.campus_id;
        if (!cid) {
          // Fallback to fetching profile if campus_id is missing in auth snapshot
          const profile = await fetchProfile(auth.user_id, null);
          cid = profile.campus_id;
        }

        if (cid) {
          const campuses = await listCampuses();
          const campus = campuses.find((c) => c.id === cid);
          const isMcGill = campus?.id === MCGILL_ID || campus?.name?.toLowerCase().includes("mcgill");
          const logo =
            campus?.logo_url ??
            (campus?.domain ? `https://logo.clearbit.com/${campus.domain}` : null) ??
            (isMcGill ? "/university-logos/mcgill.svg" : null);
          setCampusLogoSrc(logo);
        }
      } catch (err) {
        console.error("Failed to load campus info for header", err);
      }
    };
    loadCampus();
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
    <header className={`sticky top-0 z-30 ${logoBackgroundTone === "transparent" ? "" : "border-b border-warm-sand bg-glass shadow-soft"}`}>
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <BrandLogo
            backgroundTone={logoBackgroundTone}
            logoWidth={220}
            logoHeight={220}
            logoClassName="h-16 w-auto sm:h-20"
            className="text-[#b7222d]"
            asLink={false}
          />
          {campusLogoSrc && (
            <>
              <div className="h-8 w-px bg-[#b7222d]/20" />
              <div className="flex items-center justify-center h-14 w-14 overflow-hidden rounded-full border border-warm-sand/60 bg-white">
                <Image
                  src={campusLogoSrc}
                  alt="Campus Logo"
                  width={48}
                  height={48}
                  className="h-full w-full object-contain"
                  priority
                  unoptimized
                />
              </div>
            </>
          )}
        </div>
        <nav className="hidden items-center gap-1 md:flex">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${activeMap[link.href]
                ? "bg-midnight text-white shadow-soft"
                : "text-navy hover:bg-warm-sand/80 hover:text-midnight"
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
                className={`rounded px-3 py-2 text-sm font-medium ${activeMap[link.href]
                  ? "bg-midnight text-white"
                  : "text-navy hover:bg-warm-sand hover:text-midnight"
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
