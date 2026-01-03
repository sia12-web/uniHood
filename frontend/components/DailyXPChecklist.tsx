"use client";

import { useDailyChecklist } from "@/hooks/use-daily-checklist";
import { CheckCircle2, Circle } from "lucide-react";

export function DailyXPChecklist() {
    const { checklist, loading } = useDailyChecklist();

    if (loading && !checklist) {
        return (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm animate-pulse">
                <div className="h-6 w-32 bg-slate-100 dark:bg-slate-800 rounded mb-4"></div>
                <div className="space-y-3">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-slate-50 dark:bg-slate-800 rounded"></div>)}
                </div>
            </div>
        );
    }

    if (!checklist) return null;

    const tasks = [
        { key: 'daily_login', label: "Daily Login", xp: 25, done: checklist.daily_login },
        { key: 'chat_sent', label: "Send a Message", xp: 2, done: checklist.chat_sent },
        { key: 'game_played', label: "Play a Game", xp: 50, done: checklist.game_played },
        { key: 'discovery_swipe', label: "Click on a Profile", xp: 2, done: checklist.discovery_swipe },
    ] as const;

    const completedCount = tasks.filter(t => t.done).length;
    const progress = (completedCount / tasks.length) * 100;

    return (
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Daily Tasks</h3>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                    {completedCount}/{tasks.length}
                </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full mb-6 overflow-hidden">
                <div
                    className="h-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="space-y-4">
                {tasks.map((task) => (
                    <div key={task.key} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            {task.done ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                                <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors" />
                            )}
                            <span className={`text-sm font-medium ${task.done ? 'text-slate-400 line-through decoration-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                {task.label}
                            </span>
                        </div>
                        <span className={`text-xs font-bold ${task.done ? 'text-slate-400' : 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded'}`}>
                            +{task.xp} XP
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}
