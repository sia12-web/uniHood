import React from "react";

import type { LeaderboardRow, LeaderboardScope } from "@/lib/types";

interface LeaderboardTableProps {
  scope: LeaderboardScope;
  items: LeaderboardRow[];
  highlightUserId?: string;
  isLoading?: boolean;
}

function formatScore(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(1);
}

export default function LeaderboardTable({ scope, items, highlightUserId, isLoading = false }: LeaderboardTableProps) {
  if (isLoading) {
    return <div className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Loading {scope} leaderboard…</div>;
  }

  if (items.length === 0) {
    return <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">No entries yet for this leaderboard.</div>;
  }

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rank
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              User
            </th>
            <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              {scope === "social" ? "Social Score" : "Score"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((row) => {
            const isMine = highlightUserId ? row.user_id === highlightUserId : false;
            // Prefer display_name, then truncated UUID as fallback
            const displayName = row.display_name || `${row.user_id.slice(0, 8)}…${row.user_id.slice(-4)}`;
            // For social scope, display as integer (the Social Score)
            const scoreDisplay = scope === "social"
              ? Math.floor(row.score).toString()
              : formatScore(row.score);
            return (
              <tr key={row.user_id} className={isMine ? "bg-amber-50" : "bg-white"}>
                <td className="whitespace-nowrap px-4 py-2 text-sm font-semibold text-slate-700">#{row.rank}</td>
                <td className="px-4 py-2 text-sm text-slate-700">
                  {displayName}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-semibold text-slate-700">{scoreDisplay}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
