"use client";

import { type ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import { StoryInviteProvider } from "@/components/providers/story-invite-provider";
import { TypingDuelInviteProvider } from "@/components/providers/typing-duel-invite-provider";
import { ActivityAcceptanceProvider } from "@/components/providers/activity-acceptance-provider";
import { DeferredFeaturesProvider } from "@/components/providers/deferred-features-provider";

export default function AuthenticatedAppChrome({ children }: { children: ReactNode }) {
    return (
        <DeferredFeaturesProvider>
            <StoryInviteProvider>
                <TypingDuelInviteProvider>
                    <ActivityAcceptanceProvider>
                        <div className="flex min-h-screen flex-col bg-cream dark:bg-slate-950 text-navy dark:text-slate-200">
                            <SiteHeader />
                            <main className="flex-1 pb-16">
                                <div className="relative h-full w-full">
                                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(240,92,77,0.12)_0%,_rgba(255,255,255,0)_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.15)_0%,_rgba(0,0,0,0)_55%)]" />
                                    <div className="relative h-full w-full">{children}</div>
                                </div>
                            </main>
                            <footer className="border-t border-warm-sand dark:border-slate-700 bg-warm-sand/60 dark:bg-slate-900/80">
                                <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-navy dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                                    <p>© {new Date().getFullYear()} Campus. Designed for on-campus proximity.</p>
                                    <p className="text-xs opacity-70">Build v1 scaffolding preview.</p>
                                </div>
                            </footer>
                        </div>
                    </ActivityAcceptanceProvider>
                </TypingDuelInviteProvider>
            </StoryInviteProvider>
        </DeferredFeaturesProvider>
    );
}
