"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Gamepad2, Loader2, Trophy, Users } from "lucide-react";

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
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Connecting to board...
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
  const { state, makeMove, restartGame, toggleReady, leave } = useTicTacToeSession(sessionId ?? "");

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

  useEffect(() => {
    if (!wantsInviteFocus) {
      return;
    }
    inviteCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setInviteFocusPulse(true);
    const timer = window.setTimeout(() => setInviteFocusPulse(false), 2200);
    router.replace("/activities/tictactoe", { scroll: false });
    return () => {
      window.clearTimeout(timer);
    };
  }, [router, wantsInviteFocus]);

  useEffect(() => {
    setSelfId(getSelf());
  }, []);

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

  const handleAcceptInvite = useCallback(() => {
    if (!invite) return;
    setSessionId(invite.sessionId);
    acknowledge(invite.sessionId);
  }, [invite, acknowledge]);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="relative overflow-hidden bg-[#040617] pb-12 pt-16 text-white shadow-xl lg:pt-24">
        <div className="absolute inset-0 bg-[url('/activities/tictactoe.svg')] bg-cover bg-center opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#040617]" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-6">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-200 ring-1 ring-sky-500/40">
                <Gamepad2 className="h-3 w-3" />
                Classic duel
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.5em] text-white/60">Mini activities</p>
                <h1 className="text-3xl font-semibold text-white md:text-4xl">Tic-Tac-Toe Arena</h1>
              </div>
              <p className="text-lg text-slate-200 md:text-xl">
                Spin up a board, send the invite, and go head-to-head for leaderboard points.
              </p>
            </div>
            <div className="flex gap-8 text-center text-sm uppercase tracking-wider text-slate-300">
              <div>
                <div className="text-3xl font-bold text-white">2</div>
                <div>Players</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-300">Live</div>
                <div>Sync</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-6xl px-6">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          {/* Create Duel Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg ring-1 ring-slate-900/5">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Start a New Match</h2>
                <p className="text-sm text-slate-500">Select a friend to challenge instantly.</p>
              </div>
              <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
                <Trophy className="h-6 w-6" />
              </div>
            </div>

            {sessionId ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner ring-1 ring-slate-900/5">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2">
                      <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Session active
                  </div>
                  <span className="font-mono text-xs text-slate-400">ID: {sessionId}</span>
                </div>
                <div className="p-4 sm:p-6">
                  <TicTacToeBoard state={state} onMove={makeMove} onRestart={restartGame} onToggleReady={toggleReady} onLeave={leave} playerNames={playerNames} />
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">Select Opponent</span>
                    <span className="text-slate-400">You: {selfId || "Unknown"}</span>
                  </div>

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
                        <Link href="/friends" className="mt-2 text-xs font-medium text-indigo-600 hover:underline">
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
                                ? "bg-white shadow-md ring-1 ring-indigo-500"
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
                              <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"}`}>
                                {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <div>
                                <div className={`font-medium ${isSelected ? "text-indigo-900" : "text-slate-700"}`}>{label}</div>
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

                {createError && (
                  <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
                    {createError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creating || !friendId}
                  className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-indigo-600 px-8 py-4 font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {creating ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Spawning arena...
                      </>
                    ) : (
                      <>
                        Create Match
                        <Gamepad2 className="h-5 w-5 transition-transform group-hover:scale-110" />
                      </>
                    )}
                  </span>
                </button>
              </form>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div 
              ref={inviteCardRef}
              className={`rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-900/5 border border-slate-200 transition-all duration-1000 ${
                inviteFocusPulse ? "ring-4 ring-indigo-500/50 shadow-indigo-500/20" : ""
              }`}
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Invite Inbox</h2>
                  <p className="text-sm text-slate-500">Incoming matches appear here.</p>
                </div>
                <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                  <Users className="h-6 w-6" />
                </div>
              </div>

              {invite ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-indigo-200 bg-indigo-50 py-8 text-center">
                  <div className="rounded-full bg-indigo-100 p-3">
                    <Gamepad2 className="h-6 w-6 text-indigo-600" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-indigo-900">
                    Duel request from {invite.opponentUserId}
                  </p>
                  <button
                    onClick={handleAcceptInvite}
                    className="mt-4 rounded-xl bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                  >
                    Accept Challenge
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                  <div className="rounded-full bg-slate-100 p-3">
                    <Users className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-900">No pending invites</p>
                  <p className="mt-1 text-xs text-slate-500">Friends will drop their matches here soon.</p>
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-lg">
              <h3 className="font-bold text-white">How invites work</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">1</span>
                  <span>Host picks a friend and starts a match.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">2</span>
                  <span>An invite pops into this inbox for that friend.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">3</span>
                  <span>They accept to join instantly as Player O.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-3xl bg-slate-900 p-8 text-white shadow-xl">
          <p className="text-xs uppercase tracking-[0.5em] text-white/50">How it works</p>
          <h3 className="mt-2 text-2xl font-semibold">Match flow</h3>
          <ul className="mt-6 grid gap-4 text-sm text-slate-200 md:grid-cols-3">
            <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.6em] text-white/60">1</p>
              <p className="mt-2 text-base font-medium text-white">Both players press Ready in the lobby.</p>
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.6em] text-white/60">2</p>
              <p className="mt-2 text-base font-medium text-white">Countdown hits 0, the board unlocks, and turns alternate automatically.</p>
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.6em] text-white/60">3</p>
              <p className="mt-2 text-base font-medium text-white">Winner claims the round and scores update on the leaderboard.</p>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
