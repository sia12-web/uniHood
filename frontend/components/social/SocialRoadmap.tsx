"use client";

import { motion } from "framer-motion";
import { Check, Lock, ChevronRight, Star, Sparkles, Trophy, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_DETAILS, getLevelProgress } from "@/lib/xp";

interface SocialRoadmapProps {
    currentLevel: number;
    currentXp: number;
    nextLevelXp?: number | null;
}

export function SocialRoadmap({ currentLevel, currentXp, nextLevelXp }: SocialRoadmapProps) {
    const levels = Object.values(LEVEL_DETAILS);
    const progress = getLevelProgress(currentXp, currentLevel, nextLevelXp);

    return (
        <div className="space-y-12 py-8">
            {/* Roadmap Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <Target className="text-indigo-600 h-8 w-8" />
                        Reputation Roadmap
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
                        Track your progress and unlock the full campus ecosystem.
                    </p>
                </div>
                <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Current Balance</span>
                        <span className="text-xl font-black">{currentXp.toLocaleString()} XP</span>
                    </div>
                    <div className="h-8 w-[1px] bg-white/20" />
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Global Rank</span>
                        <span className="text-xl font-black">{LEVEL_DETAILS[currentLevel].label}</span>
                    </div>
                </div>
            </div>

            {/* The Visual Path */}
            <div className="relative pt-12 pb-20 overflow-x-auto hide-scrollbar">
                <div className="min-w-[800px] px-8">
                    {/* Background Connecting Line */}
                    <div className="absolute top-[84px] left-16 right-16 h-1 bg-slate-100 dark:bg-slate-800 rounded-full" />

                    {/* Active Progress Line */}
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentLevel - 1) / 5) * 100}%` }}
                        className="absolute top-[84px] left-16 h-1 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full z-10"
                    />

                    <div className="flex justify-between relative z-20">
                        {levels.map((lvl) => {
                            const isPast = lvl.level < currentLevel;
                            const isActive = lvl.level === currentLevel;
                            // const isLocked = lvl.level > currentLevel; (unused in rendering)

                            return (
                                <div key={lvl.level} className="flex flex-col items-center gap-6 w-32">
                                    {/* Level Node */}
                                    <div className="relative">
                                        {isActive && (
                                            <motion.div
                                                animate={{ scale: [1, 1.2, 1] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl"
                                            />
                                        )}
                                        <div className={cn(
                                            "h-14 w-14 rounded-2xl border-4 flex items-center justify-center transition-all duration-500",
                                            isPast ? "bg-indigo-600 border-indigo-200 text-white shadow-lg" :
                                                isActive ? "bg-white border-indigo-600 text-indigo-600 shadow-xl scale-110 shadow-indigo-100 dark:bg-slate-900 dark:shadow-none" :
                                                    "bg-slate-50 border-slate-200 text-slate-300 dark:bg-slate-800 dark:border-slate-700"
                                        )}>
                                            {isPast ? <Check size={24} strokeWidth={3} /> :
                                                isActive ? <Trophy size={24} /> :
                                                    <Lock size={20} />}
                                        </div>

                                        {/* XP Label */}
                                        <div className="absolute top-16 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                            <span className={cn(
                                                "text-[10px] font-black uppercase tracking-widest",
                                                isActive ? "text-indigo-600" : "text-slate-400"
                                            )}>
                                                {lvl.threshold} XP
                                            </span>
                                        </div>
                                    </div>

                                    {/* Level Label */}
                                    <div className="text-center">
                                        <h4 className={cn(
                                            "font-black text-sm tracking-tight",
                                            isActive ? "text-slate-900 dark:text-white" : "text-slate-400"
                                        )}>
                                            {lvl.label}
                                        </h4>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1">LVL {lvl.level}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Detailed Unlocks Grid */}
            <div className="grid gap-10 lg:grid-cols-2">
                {/* Current/Next Milestone Highlight */}
                <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Milestone Progress</span>
                            <h4 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                                {currentLevel === 6 ? "Ultimate Tier Reached" : `To Level ${currentLevel + 1}`}
                            </h4>
                        </div>
                        {currentLevel < 6 && (
                            <div className="text-right">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">
                                    {(LEVEL_DETAILS[currentLevel + 1].threshold - currentXp).toLocaleString()}
                                </span>
                                <span className="text-xs font-bold text-slate-400 block tracking-tight">XP TO GO</span>
                            </div>
                        )}
                    </div>

                    {currentLevel < 6 ? (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-400">
                                    <span>Lvl {currentLevel}</span>
                                    <span>Lvl {currentLevel + 1}</span>
                                </div>
                                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-1 shadow-inner">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full"
                                    />
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-100 dark:border-slate-800/50">
                                <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                    <Sparkles size={14} /> Coming Next
                                </h5>
                                <div className="space-y-3">
                                    {LEVEL_DETAILS[currentLevel + 1].unlocks.map((unlock, i) => (
                                        <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 group hover:border-indigo-400 transition-colors">
                                            <span className="text-2xl group-hover:scale-125 transition-transform">{unlock.icon}</span>
                                            <div>
                                                <div className="text-sm font-black text-slate-900 dark:text-white">{unlock.title}</div>
                                                <div className="text-xs text-slate-500 font-medium">{unlock.description}</div>
                                            </div>
                                            <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="h-20 w-20 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                                <Star className="h-10 w-10 text-amber-500 fill-amber-500" />
                            </div>
                            <h5 className="text-xl font-black text-slate-900 dark:text-white">Campus Legend</h5>
                            <p className="text-sm text-slate-500 mt-2 max-w-[240px]">You&apos;ve unlocked everything! Keep hosting to maintain your featured status.</p>
                        </div>
                    )}
                </div>

                {/* All Unlocks List */}
                <div className="space-y-6">
                    <h4 className="text-xl font-black text-slate-900 dark:text-white px-2 mb-2 flex items-center gap-2">
                        <Check className="text-indigo-600" /> Current Unlocks
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-4">
                        {levels.filter(l => l.level <= currentLevel).flatMap(l => l.unlocks).map((unlock, i) => (
                            <div key={i} className="p-5 rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-sm flex items-start gap-4">
                                <div className="h-10 w-10 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-xl">
                                    {unlock.icon}
                                </div>
                                <div>
                                    <div className="text-sm font-black text-slate-900 dark:text-white">{unlock.title}</div>
                                    <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-0.5">{unlock.category}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-6 rounded-[32px] bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50">
                        <div className="flex gap-4 items-start">
                            <div className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm shrink-0">
                                <Sparkles className="text-indigo-600 h-5 w-5" />
                            </div>
                            <div>
                                <h5 className="text-sm font-black text-indigo-900 dark:text-indigo-300">Boost Your Progress</h5>
                                <p className="text-xs font-medium text-indigo-800/70 dark:text-indigo-400/70 mt-1 leading-relaxed">
                                    Verified students earn XP 20% faster through verified-only channels and daily check-ins.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
