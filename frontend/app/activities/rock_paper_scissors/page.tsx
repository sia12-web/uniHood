"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Swords, Users, Zap, Loader2 } from "lucide-react";

import { createRockPaperScissorsSession } from "@/app/features/activities/api/client";
import { RockPaperScissorsPanel } from "@/app/features/activities/components/RockPaperScissorsPanel";
import { useRockPaperScissorsInvite } from "@/hooks/activities/use-rock-paper-scissors-invite";
import { fetchFriends } from "@/lib/social";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { FriendRow } from "@/lib/types";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function RockPaperScissorsEntryPage({ searchParams }: PageProps) {
  // Support both 'sessionId' (legacy) and 'session' (from chat invite links) params
  const initialSessionId = typeof searchParams?.sessionId === "string"
    ? searchParams.sessionId
    : typeof searchParams?.session === "string"
      ? searchParams.session
      : "";
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [friendId, setFriendId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const { invite, acknowledge } = useRockPaperScissorsInvite();

  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId);
      // Acknowledge the invite when session is loaded from URL (suppresses notification)
      acknowledge(initialSessionId);
    }
  }, [initialSessionId, acknowledge]);

  useEffect(() => {
    let active = true;
    async function loadFriends() {
      setFriendsLoading(true);
      try {
        const auth = readAuthUser();
        const userId = auth?.userId ?? getDemoUserId();
        const campusId = auth?.campusId ?? getDemoCampusId();
        if (!userId) {
          setFriends([]);
          setFriendsError("Unable to resolve current user. Please sign in again.");
          return;
        }
        const rows = await fetchFriends(userId, campusId ?? null, "accepted");
        if (!active) return;
        setFriends(rows);
        setFriendsError(null);
        if (!friendId && rows.length > 0) {
          setFriendId(rows[0].friend_id);
        }
      } catch (err) {
        if (!active) return;
        setFriends([]);
        setFriendsError(err instanceof Error ? err.message : "Failed to load friends");
      } finally {
        if (active) setFriendsLoading(false);
      }
    }
    void loadFriends();
    return () => {
      active = false;
    };
  }, [friendId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const target = friendId.trim();
      if (!target) throw new Error("Select a friend to invite");
      const res = await createRockPaperScissorsSession(target);
      setSessionId(res.sessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create session";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = () => {
    if (!invite) return;
    setSessionId(invite.sessionId);
    acknowledge(invite.sessionId);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Hero Section with Full Image */}
      <div className="relative overflow-hidden shadow-xl">
        {/* Full Background Image */}
        <div className="relative aspect-[21/9] w-full">
          <Image
            src="/activities/rps.svg"
            alt="Rock Paper Scissors"
            fill
            className="object-cover"
            priority
          />
          {/* Gradient overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
        </div>

        {/* Back Button */}
        <div className="absolute left-6 top-6 z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>

        {/* How to Play Card - Bottom Right */}
        <div className="absolute bottom-6 right-6 z-10 max-w-md">
          <div className="rounded-2xl bg-black/40 p-6 ring-1 ring-white/10 backdrop-blur-md">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
              <Zap className="h-6 w-6 text-rose-400" />
              How to Play
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">1</div>
                <p className="text-sm text-slate-200">Invite a friend to a duel session.</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">2</div>
                <p className="text-sm text-slate-200">Both players must &ldquo;Ready Up&rdquo; to start.</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">3</div>
                <p className="text-sm text-slate-200">Choose Rock, Paper, or Scissors secretly.</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">4</div>
                <p className="text-sm text-slate-200">Moves are revealed at the same time. Best strategy wins!</p>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl px-6">
        {/* Game Panel or Setup */}
        {sessionId ? (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
              <div className="p-6">
                <RockPaperScissorsPanel sessionId={sessionId} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            {/* Create Session Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg ring-1 ring-slate-900/5">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Start a New Duel</h2>
                  <p className="text-sm text-slate-500">Select a friend to challenge instantly.</p>
                </div>
                <div className="rounded-full bg-rose-50 p-3 text-rose-600">
                  <Swords className="h-6 w-6" />
                </div>
              </div>

              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-3">
                  <span className="text-sm font-medium text-slate-700">Select Opponent</span>
                  <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                    {friendsLoading ? (
                      <div className="flex items-center justify-center py-8 text-slate-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading friends...
                      </div>
                    ) : friendsError ? (
                      <div className="p-4 text-center text-sm text-rose-600">{friendsError}</div>
                    ) : friends.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="mb-2 h-8 w-8 text-slate-300" />
                        <p className="text-sm text-slate-500">No friends available yet.</p>
                        <Link href="/friends" className="mt-2 text-xs font-medium text-rose-600 hover:underline">
                          Add friends first
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {friends.map((friend) => {
                          const label = friend.friend_display_name || friend.friend_handle || friend.friend_id;
                          const isSelected = friendId === friend.friend_id;
                          return (
                            <label
                              key={friend.friend_id}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-all ${isSelected
                                ? "bg-white shadow-md ring-1 ring-rose-500"
                                : "hover:bg-white hover:shadow-sm"
                                }`}
                            >
                              <input
                                type="radio"
                                name="friend"
                                value={friend.friend_id}
                                checked={isSelected}
                                onChange={() => setFriendId(friend.friend_id)}
                                className="sr-only"
                              />
                              <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? "border-rose-600 bg-rose-600" : "border-slate-300"}`}>
                                {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <div>
                                <div className={`font-medium ${isSelected ? "text-rose-900" : "text-slate-700"}`}>{label}</div>
                                {friend.friend_handle && (
                                  <div className="text-xs text-slate-500">@{friend.friend_handle}</div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !friendId}
                  className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-rose-600 px-8 py-4 font-bold text-white shadow-lg shadow-rose-500/30 transition-all hover:bg-rose-500 hover:shadow-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {busy ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Creating Arena...
                      </>
                    ) : (
                      <>
                        Create Duel Arena
                        <Swords className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </span>
                </button>
              </form>
            </div>

            {/* Invites Card */}
            <div className="flex flex-col gap-6">
              <div className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-900/5 border border-slate-200">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Invite Inbox</h2>
                    <p className="text-sm text-slate-500">Challenges waiting for you.</p>
                  </div>
                  <div className="rounded-full bg-rose-50 p-3 text-rose-600">
                    <Users className="h-6 w-6" />
                  </div>
                </div>

                {invite ? (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 p-6 text-white shadow-lg">
                    <div className="relative z-10">
                      <h3 className="text-lg font-bold">New Challenger!</h3>
                      <p className="mt-1 text-rose-100">
                        {friends.find(f => f.friend_id === invite.opponentUserId)?.friend_display_name || friends.find(f => f.friend_id === invite.opponentUserId)?.friend_handle || "A friend"} has invited you to play.
                      </p>

                      <div className="mt-6 flex items-center justify-end">
                        <button
                          onClick={handleAcceptInvite}
                          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-rose-600 shadow-sm transition hover:bg-rose-50"
                        >
                          Accept & Join
                        </button>
                      </div>
                    </div>

                    {/* Decorative circles */}
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                    <div className="rounded-full bg-slate-100 p-3">
                      <Swords className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-900">No pending invites</p>
                    <p className="mt-1 text-xs text-slate-500">Challenges will appear here instantly.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
