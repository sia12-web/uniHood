"use client";
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createTypingDuel, startActivity, fetchTypingPrompt, submitTyping } from '@/app/features/activities/api/client';
import { ScoreboardMini } from '@/app/features/activities/components/ScoreboardMini';
import { fetchFriends } from '@/lib/social';
import { readAuthUser } from '@/lib/auth-storage';
import { getDemoUserId, getDemoCampusId } from '@/lib/env';
import type { FriendRow } from '@/lib/types';
import { UncopyableSnippet } from '@/app/features/activities/components/UncopyableSnippet';
import { attachTypingBoxGuards } from '@/app/features/activities/guards/typingBoxGuards';

export default function SpeedTypingEntryPage() {
  const [peerId, setPeerId] = useState<string>('');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [typedText, setTypedText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [scoreboard, setScoreboard] = useState<Array<{ userId: string; score: number }>>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const startTsRef = useRef<number | null>(null);
  const typingBoxRef = useRef<HTMLTextAreaElement | null>(null);

  // Start the WPM clock on the user's first keystroke instead of on activity start
  useEffect(() => {
    if (!startTsRef.current && typedText.length > 0) {
      startTsRef.current = performance.now();
    }
  }, [typedText.length]);

  useEffect(() => {
    const el = typingBoxRef.current;
    if (!el) return;
    const detach = attachTypingBoxGuards(el);
    return () => {
      detach();
    };
  }, [activityId]);

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
          setFriendsError('Unable to resolve current user. Please sign in again.');
          return;
        }
        const rows = await fetchFriends(userId, campusId ?? null, 'accepted');
        if (!active) return;
        setFriends(rows);
        setFriendsError(null);
      } catch (err) {
        if (!active) return;
        setFriends([]);
        setFriendsError(err instanceof Error ? err.message : 'Failed to load friends');
      } finally {
        if (active) setFriendsLoading(false);
      }
    }
    void loadFriends();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!peerId && friends.length > 0) {
      setPeerId(friends[0].friend_id);
    }
  }, [friends, peerId]);

  const elapsedMin = startTsRef.current ? (performance.now() - startTsRef.current) / 60000 : 0; // recomputed on render for simplicity
  const wpm = elapsedMin > 0 ? (typedText.length / 5) / elapsedMin : 0;
  const progress = prompt.length ? Math.min(typedText.length / prompt.length, 1) : 0;

  const selectedFriend = useMemo(() => friends.find((f) => f.friend_id === peerId), [friends, peerId]);

  async function handleStart() {
    setStarting(true); setError(null);
    try {
      if (!peerId) throw new Error('Select a friend to challenge');
      const activity = await createTypingDuel(peerId);
      const started = await startActivity(activity.id);
      setActivityId(started.id);
      const info = await fetchTypingPrompt(started.id);
      setPrompt(info.prompt);
      setScoreboard([{ userId: started.user_a, score: 0 }, { userId: started.user_b, score: 0 }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setStarting(false);
    }
  }

  async function handleSubmit() {
    if (!activityId || submitted) return;
    try {
      setSubmitted(true);
      const result = await submitTyping(activityId, 1, typedText);
      const totals = result.totals;
      const newScores = Object.entries(totals).map(([userId, score]) => ({ userId, score }));
      setScoreboard(newScores);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Speed Typing Duel</h1>
        <p className="text-sm text-slate-600">Real‑time typing race with anti‑cheat telemetry. Paste = penalty. Accuracy & speed both matter.</p>
        <Link href="/activities" className="text-xs font-semibold text-sky-600 hover:underline">← All activities</Link>
      </header>

      {!activityId && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Set up your duel</h2>
          <p className="text-xs text-slate-600">Choose a friend to challenge. Both players join automatically when you start.</p>

          <div className="space-y-3">
            {friendsLoading ? (
              <div className="text-xs text-slate-500">Loading friends…</div>
            ) : friendsError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{friendsError}</div>
            ) : friends.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">You don’t have any accepted friends yet. Once you add friends, you can challenge them to a duel.</div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {friends.map((friend) => {
                  const selected = peerId === friend.friend_id;
                  const primary = friend.friend_display_name?.trim() || friend.friend_handle?.trim() || friend.friend_id;
                  const secondary = friend.friend_handle && friend.friend_handle !== primary ? `@${friend.friend_handle}` : friend.friend_id;
                  return (
                    <button
                      type="button"
                      key={friend.friend_id}
                      onClick={() => setPeerId(friend.friend_id)}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${selected ? 'border-sky-500 bg-sky-50 text-sky-900 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'}`}
                    >
                      <span className="flex flex-col">
                        <span className="font-semibold">{primary}</span>
                        <span className="text-xs text-slate-500">{secondary}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${selected ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {selected ? 'Selected' : 'Choose'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleStart}
              disabled={starting || friendsLoading || !peerId}
              className="inline-flex items-center rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-60"
            >
              {starting ? 'Starting…' : 'Start Duel'}
            </button>
            {selectedFriend && (
              <span className="text-xs text-slate-600">
                Opponent: {selectedFriend.friend_display_name || selectedFriend.friend_handle || selectedFriend.friend_id}
              </span>
            )}
          </div>
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-100 font-semibold text-sky-700">You</span>
            <span className="text-slate-400">+</span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-700">Friend</span>
            <span className="ml-auto rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">2 players</span>
          </div>
        </section>
      )}

      {activityId && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between text-xs text-slate-600">
            <span className="font-semibold">Activity: {activityId}</span>
            <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-200">Live duel</span>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            <div className="md:col-span-3">
              <UncopyableSnippet
                text={prompt}
                widthPx={680}
                lineHeight={22}
                padding={16}
              />
              <textarea
                ref={typingBoxRef}
                id="typing-box"
                className="w-full h-40 p-2 border rounded select-none"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                disabled={submitted}
                placeholder="Start typing here…"
              />
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                <span>WPM: {wpm.toFixed(1)}</span>
                <span>Progress: {(progress * 100).toFixed(0)}%</span>
                <button onClick={handleSubmit} disabled={submitted} className="ml-auto rounded bg-sky-600 px-3 py-1.5 text-white">Submit</button>
              </div>
            </div>
            <div className="md:col-span-1">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Scoreboard</h3>
              <ScoreboardMini participants={scoreboard} />
              <p className="mt-3 text-[10px] text-slate-500">Scores update when both players submit.</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
