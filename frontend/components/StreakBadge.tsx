import React from "react";

interface StreakBadgeProps {
  current: number;
  best: number;
  lastActiveYmd: number;
}

function formatYmd(ymd: number): string {
  const year = Math.floor(ymd / 10000);
  const month = Math.floor((ymd % 10000) / 100) - 1;
  const day = ymd % 100;
  const date = new Date(Date.UTC(year, month, day));
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function streakProgress(current: number): number {
  const target = 30;
  const progress = Math.min(current, target);
  return Math.round((progress / target) * 100);
}

export default function StreakBadge({ current, best, lastActiveYmd }: StreakBadgeProps) {
  const percent = streakProgress(current);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Activity Streak</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-amber-600">{current}</span>
          <span className="text-sm text-slate-500">days</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Best streak: {best}d</span>
        <span>Last active: {lastActiveYmd ? formatYmd(lastActiveYmd) : "—"}</span>
      </div>
      <p className="text-xs text-slate-500">Progress to 30-day badge: {percent}%</p>
    </div>
  );
}
