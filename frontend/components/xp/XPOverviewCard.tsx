"use client";

import { Info, Sparkles } from "lucide-react";
import { XPProgressBar } from "./XPProgressBar";
import { LevelBadge } from "./LevelBadge";
import Link from "next/link";

interface XPOverviewCardProps {
    xp: number;
    level: number;
    nextLevelXp?: number | null;
}

export function XPOverviewCard({ xp, level, nextLevelXp }: XPOverviewCardProps) {

    return (
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            {/* Background Accent */}
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-indigo-500/5 blur-3xl" />

            <div className="relative flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                        <Sparkles className="h-5 w-5 text-indigo-500" />
                        <h2 className="text-lg font-bold tracking-tight">Campus Reputation</h2>
                    </div>
                    <Link
                        href="/settings/profile?tab=reputation"
                        className="flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                    >
                        <Info className="h-3.5 w-3.5" />
                        Guide
                    </Link>
                </div>

                <div className="grid gap-6 md:grid-cols-[140px_1fr] md:items-center">
                    <div className="flex justify-center md:justify-start">
                        <LevelBadge level={level} size="lg" className="shadow-sm" />
                    </div>

                    <div className="space-y-1">
                        <XPProgressBar xp={xp} level={level} nextLevelXp={nextLevelXp} />
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 text-center md:text-left">
                            Keep engaging with the community to reach the next tier!
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
