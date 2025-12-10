"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Gamepad2, Loader2, Trophy, Users, Check, AlertCircle } from "lucide-react";

import { createTicTacToeSession, getSelf } from "@/app/features/activities/api/client";
import { useTicTacToeSession } from "@/app/features/activities/hooks/useTicTacToeSession";
import { useTicTacToeInvite } from "@/hooks/activities/use-tictactoe-invite";
import { fetchFriends } from "@/lib/social";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { FriendRow } from "@/lib/types";

const TicTacToeBoard = dynamic(
  () => import("@/app/features/activities/components/TicTacToeBoard").then((m) => m.TicTacToeBoard),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        <span className="font-medium">Loading game board...</span>
      </div>
    ),
  },
);

export default function TicTacToeEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCardRef = useRef<HTMLDivElement>(null);
  const [inviteFocusPulse, setInviteFocusPulse] = useState(false);
  const wantsInviteFocus = searchParams?.get("focus") === "invites";

  const [selfId, setSelfId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [friendId, setFriendId] = useState("");
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});

  const { invite, acknowledge } = useTicTacToeInvite();
  // We only initialize the hook when sessionId is available
  const { state, makeMove, restartGame, toggleReady, leave } = useTicTacToeSession(sessionId ?? "");

  const handleAcceptInvite = useCallback(() => {
    if (!invite) return;
    setSessionId(invite.sessionId);
    acknowledge(invite.sessionId);
  }, [invite, acknowledge]);

  // Update player names map from friends list
  useEffect(() => {
    const auth = readAuthUser();
    const names: Record<string, string> = {};
    if (auth) {
      names[auth.userId] = auth.displayName || auth.handle || "Me";
    }
    friends.forEach((f) => {
      names[f.friend_id] = f.friend_display_name || f.friend_handle || "Friend";
    });
    setPlayerNames((prev) => ({ ...prev, ...names }));
  }, [friends]);

  // Read session ID from URL query parameter (for game invite links)
  useEffect(() => {
    const sessionFromUrl = searchParams?.get("session");
    if (sessionFromUrl && !sessionId) {
      setSessionId(sessionFromUrl);
      acknowledge(sessionFromUrl);
    }
  }, [searchParams, sessionId, acknowledge]);

  // Handle invite focus (from dashboard click)
  useEffect(() => {
    if (!wantsInviteFocus) return;
    inviteCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setInviteFocusPulse(true);
    const timer = window.setTimeout(() => setInviteFocusPulse(false), 2200);
    router.replace("/activities/tictactoe", { scroll: false });
    return () => window.clearTimeout(timer);
  }, [router, wantsInviteFocus]);

  // Get self ID
  useEffect(() => {
    setSelfId(getSelf());
  }, []);

  // Load friends
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

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const target = friendId.trim();
      if (!target) {
        throw new Error("Select a friend to invite");
      }
      const id = await createTicTacToeSession(target);
      setSessionId(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create match";
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }, [friendId]);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-[#040617] pb-12 pt-16 text-white shadow-xl lg:pt-24">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#040617]" />

        <div className="relative mx-auto max-w-5xl px-6">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">
                Tic Tac Toe
              </h1>
              <p className="mt-4 text-lg text-slate-400 md:text-xl">
                The classic game of X&apos;s and O&apos;s. Challenge a friend to a strategic battle. First to 2 wins takes the crown.
              </p>

              <div className="flex gap-8 pt-4">
                <div>
                  <div className="text-3xl font-bold text-white">1v1</div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Format</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-cyan-400">3</div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Rounds</div>
                </div>
              </div>
            </div>

            {/* How to Play Card */}
            <div className="relative overflow-hidden rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-sm">
              <div className="relative z-10">
                <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-white">
                  <Gamepad2 className="h-5 w-5 text-cyan-400" />
                  How to Play
                </h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-white">1</div>
                    <p className="text-sm text-slate-300">Select a friend to challenge.</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-white">2</div>
                    <p className="text-sm text-slate-300">Play a series of Tic Tac Toe games.</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-white">3</div>
                    <p className="text-sm text-slate-300">First to win 2 rounds wins the match!</p>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl px-6">
        {sessionId ? (
          // Active Game View (Full Width Card)
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
            <div className="p-6 md:p-8">
              <TicTacToeBoard
                state={state}
                onMove={makeMove}
                onRestart={restartGame}
                onToggleReady={() => toggleReady(!state.ready?.[selfId ?? ""])}
                onLeave={leave}
                playerNames={playerNames}
              />
            </div>
          </div>
        ) : (
          // Lobby / Create View
          <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
            <div className="space-y-8">
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900">
                  <Users className="h-5 w-5 text-cyan-600" />
                  Invite a Friend
                </h2>

                {friendsLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                  </div>
                ) : friendsError ? (
                  <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-600">
                    <AlertCircle className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    {friendsError}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {friends.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                        No friends online right now.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {friends.map((friend) => (
                          <button
                            key={friend.friend_id}
                            onClick={() => setFriendId(friend.friend_id)}
                            className={`group relative flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:shadow-md ${friendId === friend.friend_id
                              ? "border-cyan-500 bg-cyan-50 ring-1 ring-cyan-500"
                              : "border-slate-200 hover:border-cyan-300 hover:bg-slate-50"
                              }`}
                          >
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold transition-colors ${friendId === friend.friend_id ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500 group-hover:bg-cyan-50 group-hover:text-cyan-600"
                              }`}>
                              {(friend.friend_display_name?.[0] || friend.friend_handle?.[0] || "?").toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-bold text-slate-900">
                                {friend.friend_display_name || friend.friend_handle}
                              </div>
                              {friend.friend_display_name && (
                                <div className="truncate text-xs font-medium text-slate-500">@{friend.friend_handle}</div>
                              )}
                            </div>
                            {friendId === friend.friend_id && (
                              <div className="absolute right-3 top-3 rounded-full bg-cyan-500 p-1 text-white shadow-sm">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-slate-100 pt-6">
                      <button
                        onClick={handleCreate}
                        disabled={creating || !friendId}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-slate-900/10 transition-all hover:bg-slate-800 hover:shadow-slate-900/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                      >
                        {creating ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Creating Session...
                          </>
                        ) : (
                          <>
                            Start Duel
                            <div className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white/80">
                              PRO
                            </div>
                          </>
                        )}
                      </button>
                      {createError && (
                        <p className="mt-3 text-center text-sm font-medium text-rose-500">{createError}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {/* Invite Inbox */}
              <div
                ref={inviteCardRef}
                className={`rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5 transition-all ${inviteFocusPulse || invite ? "ring-4 ring-cyan-200" : ""
                  }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Invite Inbox</h2>
                    <p className="text-xs text-slate-500">Challenges waiting for you.</p>
                  </div>
                  <div className="rounded-full bg-cyan-50 p-2 text-cyan-600">
                    <Users className="h-5 w-5" />
                  </div>
                </div>

                {invite ? (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-5 text-white shadow-lg">
                    <div className="relative z-10">
                      <h3 className="font-bold">New Challenger!</h3>
                      <p className="mt-1 text-xs text-cyan-100">
                        {friends.find((f) => f.friend_id === invite.opponentUserId)?.friend_display_name || "A friend"} has invited you.
                      </p>

                      <div className="mt-4 flex items-center justify-end">
                        <button
                          onClick={handleAcceptInvite}
                          className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-cyan-700 shadow-sm transition hover:bg-cyan-50"
                        >
                          Accept & Play
                        </button>
                      </div>
                    </div>
                    {/* Decorative circles */}
                    <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
                    <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-white/10 blur-xl" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-8 text-center">
                    <div className="rounded-full bg-slate-100 p-2">
                      <Users className="h-5 w-5 text-slate-400" />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-900">No pending invites</p>
                  </div>
                )}
              </div>
              <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl">
                <div className="mb-6 flex items-center gap-2 text-cyan-400">
                  <Trophy className="h-5 w-5" />
                  <span className="font-bold uppercase tracking-wider">Your Stats</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm transition-colors hover:bg-white/15">
                    <div className="text-3xl font-black">0</div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Wins</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm transition-colors hover:bg-white/15">
                    <div className="text-3xl font-black">0</div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Played</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>


    </main>
  );
}
