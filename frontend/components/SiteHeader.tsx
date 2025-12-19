"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { UserCircle } from "lucide-react";


function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteHeader() {
  const pathname = usePathname() ?? "/";

  const suppressedPrefixes = [
    // Landing pages often have their own header or none
    "/contact",
    "/legal",
    "/privacy",
    "/terms",
    "/cookies",
    // Auth
    "/login",
    "/onboarding",
    "/select-university",
    "/select-courses",
    "/set-profile",
    "/welcome",
    "/major-year",
    "/passions",
    "/photos",
    "/verify-email",
    "/join",
    "/reset-password",
    "/forgot-password",
  ];

  // Also suppress on root if it's a landing page (optional, depends on design)
  // But generally AuthenticatedAppChrome is for auth'd users.

  const shouldRenderHeader = !suppressedPrefixes.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
  );

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!shouldRenderHeader || typeof window === "undefined") {
      return;
    }
    setHydrated(true);
  }, [shouldRenderHeader, pathname]);

  const navLinks = useMemo<Array<{ href: string; label: string }>>(() => {
    return [
      { label: "Discover", href: "/discovery" },
      { label: "Chat", href: "/chat" },
      { label: "Meetups", href: "/meetups" },
      { label: "Rank", href: "/leaderboards" },
    ];
  }, []);

  const visibleLinks = hydrated ? navLinks : [];

  const activeMap = useMemo(() => {
    return navLinks.reduce<Record<string, boolean>>((acc, link) => {
      acc[link.href] = isActive(pathname, link.href);
      return acc;
    }, {});
  }, [pathname, navLinks]);

  if (!shouldRenderHeader) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo Area */}
        <div className="flex h-full items-center">
          <Link href="/discovery" className="flex items-center gap-2">
            {/* Clean Logo without box */}
            <BrandLogo withWordmark asLink={false} logoClassName="h-8 w-auto" wordmarkTitleClassName="text-xl tracking-tight font-bold text-rose-700" disableMixBlend={true} />
          </Link>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex absolute left-1/2 -translate-x-1/2">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${activeMap[link.href]
                ? "bg-rose-50 text-rose-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Side / Profile */}
        <div className="flex items-center gap-4">
          {/* Desktop Profile Link */}
          <Link
            href="/settings/profile"
            className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
          >
            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center">
              <UserCircle size={16} className="text-slate-500" />
            </div>
            <span>Profile</span>
          </Link>

          {/* Mobile Profile Icon (Visible only if header is shown on mobile, but usually BottomNav takes over) */}
          {/* Typically we might want a settings cog or notifications here on mobile? 
                But for now, sticking to the plan: BottomNav handles mobile nav. 
                We can leave this empty for mobile or add a notification bell later. 
            */}
        </div>
      </div>
    </header>
  );
}

