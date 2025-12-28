"use client";

import { cn } from "@/lib/utils";
import { getLevelProgress } from "@/lib/xp";
import { motion } from "framer-motion";

interface XPProgressBarProps {
    xp: number;
    level: number;
    nextLevelXp?: number | null;
    className?: string;
    showText?: boolean;
}

export function XPProgressBar({ xp, level, nextLevelXp, className, showText = true }: XPProgressBarProps) {
    const percent = getLevelProgress(xp, level, nextLevelXp);
    const formatNumber = (num: number) => new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);

    return (
        <div className={cn("w-full select-none", className)}>
            {showText && (
                <div className="flex justify-between items-end text-xs mb-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                        Level {level}
                    </span>
                    <span className="font-medium text-slate-500 dark:text-slate-400">
                        {nextLevelXp ? (
                            <>{formatNumber(xp)} <span className="text-slate-300 dark:text-slate-600 mx-1">/</span> {formatNumber(nextLevelXp)} XP</>
                        ) : (
                            <span className="text-amber-500 font-bold">Max Level</span>
                        )}
                    </span>
                </div>
            )}

            {/* Progress Track */}
            <div className="relative h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner ring-1 ring-slate-900/5 dark:ring-white/5">
                {/* Fill */}
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={cn(
                        "relative h-full rounded-full overflow-visible",
                        "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500",
                        percent >= 100 && "animate-pulse"
                    )}
                >
                    {/* Glossy Overlay */}
                    <div className="absolute inset-0 bg-white/10" />
                    {/* End Glow */}
                    {percent > 5 && percent < 100 && (
                        <div
                            className="absolute right-0 top-0 h-full w-4 -translate-y-[20%] blur-md bg-fuchsia-400 opacity-50"
                            style={{ boxShadow: '0 0 15px 4px rgba(232, 121, 249, 0.6)' }}
                        />
                    )}
                </motion.div>
            </div>
        </div>
    );
}
