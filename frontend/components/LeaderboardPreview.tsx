"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { fetchLeaderboard } from "@/lib/leaderboards";
import type { LeaderboardRow, NearbyUser } from "@/lib/types";
import { readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { Trophy } from "lucide-react";
import { ProfileDetailModal } from "./ProfileDetailModal";
import { fetchDiscoveryCard } from "@/lib/discovery";
import { sendInvite, fetchSocialUsage } from "@/lib/social";
import { getOrCreateIdemKey } from "@/app/api/idempotency";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { emitInviteCountRefresh } from "@/hooks/social/use-invite-count";
import { emitFriendshipFormed } from "@/lib/friends-events";

export function LeaderboardPreview() {
  const [leaders, setLeaders] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [invitePendingId, setInvitePendingId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  const { data: socialUsage, refetch: refetchUsage } = useQuery({
    queryKey: ["social-usage", authUser?.userId],
    queryFn: () => fetchSocialUsage(authUser!.userId, authUser!.campusId),
    enabled: !!authUser?.userId && !!authUser?.campusId,
  });

  const handleRowClick = async (row: LeaderboardRow) => {
    // Show minimal version instantly
    const minimal: NearbyUser = {
      user_id: row.user_id,
      display_name: row.display_name || "Anonymous",
      handle: row.handle || "",
      avatar_url: row.avatar_url,
      distance_m: null,
    } as NearbyUser;
    setSelectedUser(minimal);

    // Fetch full card
    if (authUser?.userId && authUser?.campusId) {
      try {
        const full = await fetchDiscoveryCard(authUser.userId, authUser.campusId, row.user_id);
        setSelectedUser(full);
        if (full.is_friend) {
          setFriendIds(prev => new Set(prev).add(row.user_id));
        }
      } catch (err) {
        console.error("Failed to fetch full card:", err);
      }
    }
  };

  const handleInvite = async (targetUserId: string) => {
    if (!authUser?.userId || !authUser?.campusId) return;

    if (socialUsage && socialUsage.daily_usage >= socialUsage.daily_limit) {
      alert(`Daily invite limit reached (${socialUsage.daily_limit}). Level up to increase your limit!`);
      return;
    }

    setInvitePendingId(targetUserId);
    try {
      const payload = { to_user_id: targetUserId, campus_id: authUser.campusId } as const;
      const idemKey = await getOrCreateIdemKey("/invites/send", payload);
      const summary = await sendInvite(authUser.userId, authUser.campusId, targetUserId, { idemKey });

      if (summary.status === "accepted") {
        setFriendIds(prev => new Set(prev).add(targetUserId));
        emitFriendshipFormed(targetUserId);
      } else {
        setInvitedIds(prev => new Set(prev).add(targetUserId));
      }
      emitInviteCountRefresh();
      void refetchUsage();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInvitePendingId(null);
    }
  };

  const handleChat = (targetUserId: string) => {
    router.push(`/chat/${targetUserId}`);
  };

  useEffect(() => {
    setAuthUser(readAuthUser());
  }, []);

  useEffect(() => {
    // Fetch social leaderboard to show players with highest Social Score
    const campusId = authUser?.campusId;
    if (!campusId) {
      if (authUser !== null) setLoading(false); // Done hydration but no campus
      return;
    }

    fetchLeaderboard("social", { limit: 5, campusId })
      .then((data) => {
        setLeaders(data.items);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch leaderboard:", err);
        setLoading(false);
      });
  }, [authUser]);

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

  const getRankStyles = (rank: number) => {
    switch (rank) {
      case 1: return { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", icon: "text-yellow-500" };
      case 2: return { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", icon: "text-slate-500" };
      case 3: return { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", icon: "text-orange-500" };
      default: return { bg: "bg-white", border: "border-transparent", text: "text-slate-600", icon: "text-slate-400" };
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-50 mb-4">
        <h3 className="text-lg font-bold text-slate-900">Top Players</h3>
        <Trophy className="h-5 w-5 text-indigo-500" />
      </div>

      <div className="space-y-3">
        {leaders.map((leader, index) => {
          const styles = getRankStyles(leader.rank);
          return (
            <div
              key={leader.user_id}
              className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${styles.bg} ${styles.border}`}
              onClick={() => handleRowClick(leader)}
            >
              <div className="flex items-center gap-4">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${styles.text}`}>
                  {leader.rank}
                </div>

                <div className="relative">
                  {leader.avatar_url ? (
                    <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm">
                      <Image
                        src={leader.avatar_url}
                        alt={leader.display_name || "User"}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center border-2 border-white shadow-sm text-indigo-600 font-bold">
                      {(leader.display_name?.[0] || "U").toUpperCase()}
                    </div>
                  )}
                  {index < 3 && (
                    <div className="absolute -top-1 -right-1">
                      <Trophy className={`w-4 h-4 fill-current ${styles.icon}`} />
                    </div>
                  )}
                </div>

                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900 line-clamp-1">
                    {leader.display_name || "Anonymous"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">@{leader.handle || "user"}</span>
                </div>
              </div>

              <div className="text-right">
                <div className="font-black text-indigo-600 text-sm">{Math.floor(leader.score)}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">XP</div>
              </div>
            </div>
          );
        })}

        {leaders.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            No rankings yet. Be the first!
          </div>
        )}

        <div className="pt-2">
          <Link
            href="/leaderboards"
            className="block w-full rounded-xl bg-indigo-50 py-3 text-center text-sm font-bold text-indigo-600 hover:bg-indigo-100 transition-colors"
          >
            View Full Leaderboard
          </Link>
        </div>
      </div>

      {selectedUser && (
        <ProfileDetailModal
          user={selectedUser}
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          onInvite={() => handleInvite(selectedUser.user_id)}
          onChat={() => handleChat(selectedUser.user_id)}
          isFriend={friendIds.has(selectedUser.user_id) || !!selectedUser.is_friend}
          isInvited={invitedIds.has(selectedUser.user_id)}
          invitePending={invitePendingId === selectedUser.user_id}
        />
      )}
    </div>
  );
}
