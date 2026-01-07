"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Loader2, Users, AlertCircle } from "lucide-react";

import { createTicTacToeSession } from "@/app/features/activities/api/client";
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
    <main className="min-h-[100dvh] bg-slate-50 pb-20">
      {/* Hero Section with Full Image */}
      <div className="relative overflow-hidden shadow-xl bg-slate-900">
        {/* Full Background Image */}
        <div className="relative h-[300px] w-full md:aspect-[21/9] md:h-auto">
          <Image
            src="/activities/tictactoe.svg"
            alt="Tic Tac Toe"
            fill
            className="object-cover opacity-90"
            priority
          />
          {/* Gradient overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-black/40" />
        </div>

        {/* Back Button */}


        {/* How to Play Card - Responsive */}
        {/* Mobile: Relative block below image. Desktop: Absolute bottom-right overlay. */}
        <div className="relative z-10 bg-slate-900 px-6 pb-6 md:absolute md:bottom-6 md:right-6 md:bg-transparent md:p-0 md:pb-0 pointer-events-none">
          <div className="pointer-events-auto max-w-md ml-auto md:ml-0 rounded-2xl bg-slate-800/50 p-6 ring-1 ring-white/10 backdrop-blur-md md:bg-black/40">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
              <Gamepad2 className="h-6 w-6 text-cyan-400" />
              How to Play
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-white">1</div>
                <p className="text-sm text-slate-200">Select a friend to challenge.</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-white">2</div>
                <p className="text-sm text-slate-200">Both players must <span className="font-bold text-white">Ready Up</span> to start.</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-white">3</div>
                <p className="text-sm text-slate-200">Best of 5 rounds. <span className="font-bold text-white">First to 3 wins!</span></p>
              </li>
            </ul>
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
                onToggleReady={toggleReady}
                onLeave={leave}
                playerNames={playerNames}
              />
            </div>
          </div>
        ) : (
          // Lobby / Create View
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg ring-1 ring-slate-900/5">
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
                <div className="space-y-3">
                  <span className="text-sm font-medium text-slate-700">Select Opponent</span>
                  <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                    {friends.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="mb-2 h-8 w-8 text-slate-300" />
                        <p className="text-sm text-slate-500">No friends available yet.</p>
                        <Link href="/socials?tab=friends" className="mt-2 text-xs font-medium text-cyan-600 hover:underline">
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
                                ? "bg-white shadow-md ring-1 ring-cyan-500"
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
                              <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? "border-cyan-600 bg-cyan-600" : "border-slate-300"}`}>
                                {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <div>
                                <div className={`font-medium ${isSelected ? "text-cyan-900" : "text-slate-700"}`}>{label}</div>
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

            {/* Invites Card */}
            <div>
              <div
                ref={inviteCardRef}
                className={`rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-900/5 ${inviteFocusPulse || invite ? "border-2 border-cyan-200 ring-cyan-200/40" : "border border-slate-200"
                  }`}
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Invite Inbox</h2>
                    <p className="text-sm text-slate-500">Challenges waiting for you.</p>
                  </div>
                  <div className="rounded-full bg-cyan-50 p-3 text-cyan-600">
                    <Users className="h-6 w-6" />
                  </div>
                </div>

                {invite ? (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 p-6 text-white shadow-lg">
                    <div className="relative z-10">
                      <h3 className="text-lg font-bold">New Challenger!</h3>
                      <p className="mt-1 text-cyan-100">
                        {friends.find((f) => f.friend_id === invite.opponentUserId)?.friend_display_name || "A friend"} has invited you.
                      </p>

                      <div className="mt-6 flex items-center justify-end">
                        <button
                          onClick={handleAcceptInvite}
                          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-cyan-600 shadow-sm transition hover:bg-cyan-50"
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
                      <Users className="h-6 w-6 text-slate-400" />
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


    </main>
  );
}
