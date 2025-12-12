"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchLeaderboard } from "@/lib/leaderboards";
import type { LeaderboardRow } from "@/lib/types";
import { Trophy } from "lucide-react";

export function LeaderboardPreview() {
  const [leaders, setLeaders] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch social leaderboard to show players with highest Social Score
    fetchLeaderboard("social", { limit: 5 })
      .then((data) => {
        setLeaders(data.items);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch leaderboard:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="text-sm font-medium text-slate-900">Top Players</h3>
          <Trophy className="h-4 w-4 text-slate-400" />
        </div>
        <div className="pt-4">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium text-slate-900">Top Players</h3>
        <Trophy className="h-4 w-4 text-slate-400" />
      </div>
      <div className="pt-4">
        <div className="space-y-4">
          {leaders.map((leader, index) => (
            <div key={leader.user_id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? "bg-yellow-100 text-yellow-700" :
                  index === 1 ? "bg-gray-100 text-gray-700" :
                    index === 2 ? "bg-orange-100 text-orange-700" :
                      "bg-slate-100 text-slate-500"
                  }`}>
                  {leader.rank}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none text-slate-900">
                    {leader.display_name || "Anonymous"}
                  </span>
                  {leader.handle && (
                    <span className="text-xs text-slate-500">@{leader.handle}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-bold text-slate-900">{Math.floor(leader.score)}</span>
                <span className="text-xs text-slate-500">Social Score</span>
              </div>
            </div>
          ))}
          <div className="pt-2">
            <Link
              href="/leaderboards"
              className="block w-full rounded-md bg-indigo-50 py-2 text-center text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
            >
              View Full Leaderboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
