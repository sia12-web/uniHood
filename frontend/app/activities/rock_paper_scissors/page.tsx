"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { createRockPaperScissorsSession, getSelf } from "@/app/features/activities/api/client";
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
  const initialSessionId = typeof searchParams?.sessionId === "string" ? searchParams.sessionId : "";
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [friendId, setFriendId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const { invite, acknowledge } = useRockPaperScissorsInvite();
  const [selfId, setSelfId] = useState("");

  useEffect(() => {
    setSelfId(getSelf());
  }, []);

  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId);
    }
  }, [initialSessionId]);

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
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Rock · Paper · Scissors</h1>
        <p className="text-sm text-slate-600">
          Classic duel with a secure commit-and-reveal board. Ready up, lock in your move, and reveal simultaneously to determine the winner.
        </p>
        <Link href="/activities" className="text-xs font-semibold text-sky-600 hover:underline">
          {"<"} All activities
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Start a duel</p>
              <p className="text-xs text-slate-500">Choose a friend and share the session link.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">You: {selfId || "."}</span>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Choose a friend</p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              {friendsLoading ? (
                <div className="p-3 text-xs text-slate-500">Loading friends.</div>
              ) : friendsError ? (
                <div className="p-3 text-xs text-rose-600">{friendsError}</div>
              ) : friends.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">No friends yet. Add some in the Friends tab.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {friends.map((friend) => {
                    const label = friend.friend_display_name || friend.friend_handle || friend.friend_id;
                    return (
                      <li key={friend.friend_id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="friend"
                            value={friend.friend_id}
                            checked={friendId === friend.friend_id}
                            onChange={() => setFriendId(friend.friend_id)}
                            className="h-4 w-4"
                          />
                          <span className="font-medium text-slate-800">{label}</span>
                          {friend.friend_handle ? (
                            <span className="text-xs text-slate-500">@{friend.friend_handle}</span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? "Creating..." : "Create session"}
          </button>
          {sessionId ? (
            <p className="break-all text-xs text-slate-600">
              Current session: <span className="font-semibold text-slate-800">{sessionId}</span>
            </p>
          ) : (
            <p className="text-xs text-slate-500">You will get a session id after creating.</p>
          )}
        </form>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Invite inbox</p>
          {invite ? (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm text-emerald-800">Friend invited you to play.</p>
              <button
                onClick={handleAcceptInvite}
                className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-semibold text-white shadow hover:bg-emerald-500"
              >
                Join session
              </button>
              <p className="break-all text-[11px] text-emerald-800">Session: {invite.sessionId}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No pending invites.</p>
          )}
          <p className="text-xs text-slate-500">Both players must ready up. Moves are hidden until reveal.</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <RockPaperScissorsPanel sessionId={sessionId} />
      </section>
    </main>
  );
}
