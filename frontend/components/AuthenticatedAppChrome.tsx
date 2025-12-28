"use client";

import { type ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import BottomNav from "@/components/BottomNav";
import { StoryInviteProvider } from "@/components/providers/story-invite-provider";
import { TypingDuelInviteProvider } from "@/components/providers/typing-duel-invite-provider";
import { TicTacToeInviteProvider } from "@/components/providers/tictactoe-invite-provider";
import { QuickTriviaInviteProvider } from "@/components/providers/quick-trivia-invite-provider";
import { RockPaperScissorsInviteProvider } from "@/components/providers/rock-paper-scissors-invite-provider";
import { ActivityAcceptanceProvider } from "@/components/providers/activity-acceptance-provider";
import { DeferredFeaturesProvider } from "@/components/providers/deferred-features-provider";
import { SocialNotifications } from "@/components/social/SocialNotifications";
import { XPNotifications } from "@/components/xp/XPNotifications";

export default function AuthenticatedAppChrome({ children }: { children: ReactNode }) {
    return (
        <DeferredFeaturesProvider>
            <SocialNotifications />
            <XPNotifications />
            <StoryInviteProvider>
                <TypingDuelInviteProvider>
                    <TicTacToeInviteProvider>
                        <QuickTriviaInviteProvider>
                            <RockPaperScissorsInviteProvider>
                                <ActivityAcceptanceProvider>
                                    <div className="flex min-h-screen flex-col bg-cream dark:bg-slate-950 text-navy dark:text-slate-200">
                                        <SiteHeader />
                                        <main className="flex-1 pb-16">
                                            <div className="relative h-full w-full">
                                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,138,101,0.15)_0%,_rgba(255,255,255,0)_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.15)_0%,_rgba(0,0,0,0)_55%)]" />
                                                <div className="relative h-full w-full">{children}</div>
                                            </div>
                                        </main>
                                        <BottomNav />
                                    </div>
                                </ActivityAcceptanceProvider>
                            </RockPaperScissorsInviteProvider>
                        </QuickTriviaInviteProvider>
                    </TicTacToeInviteProvider>
                </TypingDuelInviteProvider>
            </StoryInviteProvider>
        </DeferredFeaturesProvider>
    );
}

