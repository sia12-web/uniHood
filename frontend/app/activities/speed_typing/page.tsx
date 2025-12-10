"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import NextDynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Keyboard, Trophy, Users, ArrowLeft } from "lucide-react";

import { createSpeedTypingSession, getSelf } from "@/app/features/activities/api/client";
import { useTypingDuelInvite } from "@/hooks/activities/use-typing-duel-invite";
import { fetchFriends } from "@/lib/social";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { FriendRow } from "@/lib/types";

const SpeedTypingPanel = NextDynamic(async () => (await import("@/app/features/activities/components/SpeedTypingPanel")).SpeedTypingPanel, { ssr: false });

export default function SpeedTypingEntryPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 pb-20">
          <div className="mx-auto flex max-w-5xl items-center justify-center px-6 py-20 text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Loading speed typing…
          </div>
        </main>
      }
    >
      <SpeedTypingEntryPageContent />
    </Suspense>
  );
}

function SpeedTypingEntryPageContent() {
  const [sessionId, setSessionId] = useState<string>("");
  const [friendId, setFriendId] = useState<string>("");
  const [selfId, setSelfId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const { invite, acknowledge } = useTypingDuelInvite(); // reuse speed typing invite poll
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteCardRef = useRef<HTMLDivElement>(null);
  const [inviteFocusPulse, setInviteFocusPulse] = useState(false);
  const wantsInviteFocus = searchParams?.get("focus") === "invites";

  useEffect(() => {
    // Resolve selfId on client to avoid hydration mismatches
    setSelfId(getSelf());
  }, []);

  // Read session ID from URL query parameter (for game invite links)
  useEffect(() => {
    const sessionFromUrl = searchParams?.get("session");
    if (sessionFromUrl && !sessionId) {
      setSessionId(sessionFromUrl);
      // Acknowledge the invite when session is loaded from URL (suppresses notification)
      acknowledge(sessionFromUrl);
    }
  }, [searchParams, sessionId, acknowledge]);

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
      const res = await createSpeedTypingSession(target);
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

  useEffect(() => {
    if (!wantsInviteFocus) {
      return;
    }
    inviteCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setInviteFocusPulse(true);
    const timer = window.setTimeout(() => setInviteFocusPulse(false), 2200);
    router.replace("/activities/speed_typing", { scroll: false });
    return () => {
      window.clearTimeout(timer);
    };
  }, [router, wantsInviteFocus]);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-[#0f172a] pb-12 pt-16 text-white shadow-xl lg:pt-24">
        <div className="absolute inset-0 bg-[url('/activities/speedtyping.svg')] bg-cover bg-center opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f172a]" />

        <div className="relative mx-auto max-w-5xl px-6">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/50">
                <Keyboard className="h-3 w-3" />
                Live Multiplayer
              </div>
              <h1 className="sr-only">Speed Typing Duel</h1>
              <p className="mt-4 text-lg text-slate-300 md:text-xl">
                Challenge a friend to a real-time typing race. 10-second countdown, then prove who has the fastest fingers on campus.
              </p>
            </div>

            <div className="flex gap-8 text-center">
              <div>
                <div className="text-3xl font-bold text-white">1v1</div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Format</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-400">Live</div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Sync</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl px-6">
        {sessionId ? (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
            <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <span className="flex h-2 w-2">
                    <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-medium text-slate-600">Session Active</span>
                </div>
              </div>
            </div>
            <div className="p-6">
              <SpeedTypingPanel sessionId={sessionId} />
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            {/* Create Duel Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg ring-1 ring-slate-900/5">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Start a New Duel</h2>
                  <p className="text-sm text-slate-500">Select a friend to challenge instantly.</p>
                </div>
                <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
                  <Trophy className="h-6 w-6" />
                </div>
              </div>

              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">Select Opponent</span>
                    <span className="text-slate-400">You: {selfId || "…"}</span>
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

                {error && (
                  <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !friendId}
                  className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-indigo-600 px-8 py-4 font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                        <Keyboard className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </span>
                </button>
              </form>
            </div>

            {/* Invites Card */}
            <div className="flex flex-col gap-6">
              <div
                ref={inviteCardRef}
                className={`rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-900/5 ${inviteFocusPulse || invite ? "border-2 border-rose-200 ring-rose-200/40" : "border border-slate-200"
                  }`}
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Invite Inbox</h2>
                    <p className="text-sm text-slate-500">Challenges waiting for you.</p>
                  </div>
                  <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                    <Users className="h-6 w-6" />
                  </div>
                </div>

                {invite ? (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white shadow-lg">
                    <div className="relative z-10">
                      <h3 className="text-lg font-bold">New Challenger!</h3>
                      <p className="mt-1 text-emerald-100">
                        {friends.find(f => f.friend_id === invite.opponentUserId)?.friend_display_name || friends.find(f => f.friend_id === invite.opponentUserId)?.friend_handle || "A friend"} has invited you to a duel.
                      </p>

                      <div className="mt-6 flex items-center justify-end">
                        <button
                          onClick={handleAcceptInvite}
                          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-emerald-600 shadow-sm transition hover:bg-emerald-50"
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

              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-lg">
                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
                <div className="relative z-10">
                  <h3 className="font-bold text-white">How to Play</h3>
                  <ul className="mt-4 space-y-3 text-sm text-slate-300">
                    <li className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">1</span>
                      <span>Both players must click <span className="font-bold text-white">Ready</span> to start the countdown.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">2</span>
                      <span>Wait for the <span className="font-bold text-white">10s countdown</span>. The text will be blurred until it hits zero.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">3</span>
                      <span>Type the text exactly. First to finish with <span className="font-bold text-white">100% accuracy</span> wins.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
