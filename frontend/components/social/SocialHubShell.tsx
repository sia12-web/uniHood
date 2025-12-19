"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

export function SocialHubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 text-navy md:flex-row md:gap-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18)_0%,_rgba(255,255,255,0)_65%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(255,138,101,0.16)_0%,_rgba(255,255,255,0)_70%)]" />

      {/* Removed Sidebar and Mobile Toggle. Navigation is now global (Top/Bottom Bar) */}

      <section className="relative flex-1">
        {pathname !== "/social" ? null : (
          <header className="relative flex flex-col gap-2 rounded-3xl border border-warm-sand bg-glass p-6 text-center shadow-soft mb-6">
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

