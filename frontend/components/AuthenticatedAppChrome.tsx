"use client";

import { type ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import { StoryInviteProvider } from "@/components/providers/story-invite-provider";
import { TypingDuelInviteProvider } from "@/components/providers/typing-duel-invite-provider";
import { ActivityAcceptanceProvider } from "@/components/providers/activity-acceptance-provider";

export default function AuthenticatedAppChrome({ children }: { children: ReactNode }) {
    return (
        <StoryInviteProvider>
            <TypingDuelInviteProvider>
                <ActivityAcceptanceProvider>
                    <div className="flex min-h-screen flex-col bg-cream text-navy">
                        <SiteHeader />
                        <main className="flex-1 pb-16">
                            <div className="relative h-full w-full">
                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(240,92,77,0.12)_0%,_rgba(255,255,255,0)_55%)]" />
                                <div className="relative h-full w-full">{children}</div>
                            </div>
                        </main>
                        <footer className="border-t border-warm-sand bg-warm-sand/60">
                            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-navy sm:flex-row sm:items-center sm:justify-between">
                                <p>© {new Date().getFullYear()} Campus. Designed for on-campus proximity.</p>
                                <p className="text-xs text-navy/70">Build v1 scaffolding preview.</p>
                            </div>
                        </footer>
                    </div>
                </ActivityAcceptanceProvider>
            </TypingDuelInviteProvider>
        </StoryInviteProvider>
    );
}
