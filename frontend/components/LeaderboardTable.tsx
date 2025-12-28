import React, { useState } from "react";
import Image from "next/image";
import { ProfileDetailModal } from "@/components/ProfileDetailModal";
import type { LeaderboardRow, LeaderboardScope, NearbyUser } from "@/lib/types";

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
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);

  if (isLoading) {
    return <div className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Loading {scope} leaderboard…</div>;
  }

  if (items.length === 0) {
    return <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">No entries yet for this leaderboard.</div>;
  }

  const handleRowClick = (row: LeaderboardRow) => {
    // Create a partial NearbyUser object to satisfy the modal prop.
    // In a real app, we might fetch the full profile by ID if needed,
    // but the modal likely fetches details itself or handles minimal data gracefully.
    // Checking ProfileDetailModal props... it takes 'user: NearbyUser'.
    // We'll construct a minimal one.
    const nearbyUser: NearbyUser = {
      user_id: row.user_id,
      display_name: row.display_name || "Unknown",
      handle: row.handle || "",
      avatar_url: row.avatar_url,
      distance_m: null,
      // Other required fields might need dummies or nullable checks in types
      // Assuming types allow optional for many things or we provide defaults.
      // Let's check types.ts for NearbyUser again.
      // It has many optional fields. We provide the basics.
    } as NearbyUser;

    setSelectedUser(nearbyUser);
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                Rank
              </th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                User
              </th>
              <th scope="col" className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                {scope === "social" ? "Social Score" : "Score"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((row) => {
              const isMine = highlightUserId ? row.user_id === highlightUserId : false;
              // Prefer display_name, then truncated UUID as fallback
              const displayName = row.display_name || `${row.user_id.slice(0, 8)}…${row.user_id.slice(-4)}`;
              // For social scope, display as Level
              const scoreDisplay = scope === "social"
                ? `Lvl ${Math.floor(row.score)}`
                : formatScore(row.score);

              const initials = (displayName || "?")[0]?.toUpperCase();

              return (
                <tr
                  key={row.user_id}
                  className={`transition-colors cursor-pointer hover:bg-slate-50 ${isMine ? "bg-indigo-50/60" : "bg-white"}`}
                  onClick={() => handleRowClick(row)}
                >
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-slate-400">
                    #{row.rank}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-slate-200 ring-2 ring-white">
                        {row.avatar_url ? (
                          <Image src={row.avatar_url} alt={displayName} fill className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-600 font-bold text-sm">
                            {initials}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm font-semibold ${isMine ? "text-indigo-900" : "text-slate-900"}`}>
                          {displayName} {isMine && "(You)"}
                        </span>
                        {row.handle && <span className="text-xs text-slate-500">@{row.handle}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-indigo-600">
                    {scoreDisplay}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <ProfileDetailModal
          user={selectedUser}
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          onInvite={() => { }} // Placeholder, maybe pass actual handlers if needed context
          onChat={() => { }} // Placeholder
          isFriend={false} // Would need lookup
          isInvited={false}
          invitePending={false}
        />
      )}
    </>
  );
}
