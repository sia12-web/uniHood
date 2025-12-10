"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Swords, Users, Trophy, Copy, Check, Zap } from "lucide-react";

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
  const [copied, setCopied] = useState(false);

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

  const copySessionId = () => {
    if (!sessionId) return;
    navigator.clipboard.writeText(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-slate-900 pb-12 pt-16 text-white shadow-xl lg:pt-24">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
          </svg>
        </div>

        <div className="relative mx-auto max-w-5xl px-6">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/40">
                <Swords className="h-4 w-4" />
                <span>1v1 Duel</span>
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
                Rock Paper <span className="text-rose-400">Scissors</span>
              </h1>

              <p className="text-lg leading-8 text-slate-300">
                The classic game of strategy and chance. Challenge a friend, lock in your move, and reveal simultaneously to claim victory.
              </p>
            </div>

            {/* How to Play Card */}
            <div className="relative rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-sm">
              <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-white">
                <Zap className="h-5 w-5 text-rose-400" />
                How to Play
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold">1</div>
                  <p className="text-sm text-slate-300">Invite a friend to a duel session.</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold">2</div>
                  <p className="text-sm text-slate-300">Both players must &ldquo;Ready Up&rdquo; to start.</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold">3</div>
                  <p className="text-sm text-slate-300">Choose Rock, Paper, or Scissors secretly.</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold">4</div>
                  <p className="text-sm text-slate-300">Moves are revealed at the same time. Best strategy wins!</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl px-6">
        {/* Game Panel or Setup */}
        {sessionId ? (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                      <Swords className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">Active Session</h2>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">{sessionId}</code>
                        <button
                          onClick={copySessionId}
                          className="text-slate-400 hover:text-slate-600"
                          title="Copy Session ID"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSessionId("")}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Leave Session
                  </button>
                </div>
              </div>

              <div className="p-6">
                <RockPaperScissorsPanel sessionId={sessionId} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Create Session Card */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 transition-all hover:shadow-xl">
              <div className="bg-gradient-to-r from-rose-500 to-pink-600 px-6 py-8 text-white">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <Swords className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold">Start a Duel</h2>
                <p className="mt-2 text-rose-100">Challenge a friend to a game.</p>
              </div>

              <div className="p-6">
                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-700">Choose Opponent</label>
                    <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                      {friendsLoading ? (
                        <div className="flex items-center justify-center p-8 text-sm text-slate-500">
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-rose-600"></div>
                          Loading friends...
                        </div>
                      ) : friendsError ? (
                        <div className="p-4 text-center text-sm text-rose-600">{friendsError}</div>
                      ) : friends.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-500">
                          No friends found. Add some friends to play!
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {friends.map((friend) => {
                            const label = friend.friend_display_name || friend.friend_handle || friend.friend_id;
                            const isSelected = friendId === friend.friend_id;
                            return (
                              <li key={friend.friend_id}>
                                <label className={`flex cursor-pointer items-center justify-between px-4 py-3 transition-colors ${isSelected ? 'bg-rose-50' : 'hover:bg-slate-100'}`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isSelected ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-500'}`}>
                                      <Users className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <p className={`text-sm font-medium ${isSelected ? 'text-rose-900' : 'text-slate-700'}`}>{label}</p>
                                      {friend.friend_handle && (
                                        <p className="text-xs text-slate-500">@{friend.friend_handle}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? 'border-rose-500 bg-rose-500' : 'border-slate-300'}`}>
                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                  <input
                                    type="radio"
                                    name="friend"
                                    value={friend.friend_id}
                                    checked={isSelected}
                                    onChange={() => setFriendId(friend.friend_id)}
                                    className="sr-only"
                                  />
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy || !friendId}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-rose-500 hover:shadow disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {busy ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        Create Session
                        <Swords className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Invite Inbox Card */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 transition-all hover:shadow-xl">
              <div className="bg-slate-800 px-6 py-8 text-white">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                  <Trophy className="h-6 w-6 text-amber-400" />
                </div>
                <h2 className="text-2xl font-bold">Invites</h2>
                <p className="mt-2 text-slate-400">Accept challenges from friends.</p>
              </div>

              <div className="p-6">
                {invite ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Swords className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-emerald-900">New Challenge!</p>
                        <p className="text-xs text-emerald-700">
                          {friends.find(f => f.friend_id === invite.opponentUserId)?.friend_display_name || friends.find(f => f.friend_id === invite.opponentUserId)?.friend_handle || "A friend"} has invited you to play.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleAcceptInvite}
                      className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
                    >
                      Accept & Join
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Swords className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-900">No pending invites</p>
                    <p className="text-xs text-slate-500">Challenges will appear here.</p>
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
