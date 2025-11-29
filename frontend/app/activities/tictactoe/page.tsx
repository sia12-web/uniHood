"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Gamepad2, Loader2, RefreshCcw, Share2, Users } from "lucide-react";

import { createTicTacToeSession, getSelf } from "@/app/features/activities/api/client";

export default function TicTacToeEntryPage() {
  const router = useRouter();
  const [selfId, setSelfId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setSelfId(getSelf());
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const shareUrl = useMemo(() => {
    if (!sessionId || !origin) {
      return "";
    }
    return `${origin}/activities/tictactoe/${sessionId}`;
  }, [origin, sessionId]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const id = await createTicTacToeSession();
      setSessionId(id);
      setCopied(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create match";
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }, []);

  const handleOpenBoard = useCallback(() => {
    if (!sessionId) {
      return;
    }
    router.push(`/activities/tictactoe/${sessionId}`);
  }, [router, sessionId]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }, [shareUrl]);
  const resetSession = useCallback(() => {
    setSessionId(null);
    setCopied(false);
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="relative overflow-hidden bg-[#040617] pb-12 pt-16 text-white shadow-xl lg:pt-24">
        <div className="absolute inset-0 bg-[url('/activities/tictactoe.svg')] bg-cover bg-center opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#040617]" />
        <div className="relative mx-auto flex max-w-5xl flex-col gap-6 px-6">
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

      <div className="mx-auto mt-8 max-w-5xl px-6">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl ring-1 ring-slate-900/5">
            <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Start a new match</h2>
                <p className="text-sm text-slate-500">You host as X by default. Share the link for O to join.</p>
              </div>
              <div className="rounded-full bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                You: {selfId || "…"}
              </div>
            </header>

            <div className="mt-6 space-y-4">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="group relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:shadow-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="relative z-10 flex items-center gap-3">
                  {creating ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Spawning arena…
                    </>
                  ) : (
                    <>
                      Create head-to-head board
                      <Gamepad2 className="h-5 w-5 transition group-hover:scale-110" />
                    </>
                  )}
                </span>
                <div className="absolute inset-0 bg-white/10 opacity-0 transition group-hover:opacity-100" />
              </button>

              {createError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{createError}</p>
              ) : null}

              {sessionId ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-inner">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-500">Match ready</p>
                      <p className="text-lg font-semibold text-emerald-900">Share this link with your opponent</p>
                    </div>
                    <span className="font-mono text-sm text-emerald-700">{sessionId}</span>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white/90 p-4 text-sm text-slate-600">
                    <p className="break-all font-mono text-xs text-slate-500">{shareUrl}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex flex-1 min-w-[160px] items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                    >
                      <Copy className="h-4 w-4" />
                      {copied ? "Copied" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenBoard}
                      className="inline-flex flex-1 min-w-[160px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
                    >
                      <Share2 className="h-4 w-4" />
                      Open live board
                    </button>
                    <button
                      type="button"
                      onClick={resetSession}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      New code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                  Your match link and invite code will appear here.
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-900/5 border border-slate-200">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Invite Inbox</h2>
                  <p className="text-sm text-slate-500">Incoming Tic-Tac-Toe matches appear here.</p>
                </div>
                <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                  <Users className="h-6 w-6" />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                <div className="rounded-full bg-slate-100 p-3">
                  <Users className="h-6 w-6 text-slate-400" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-900">No pending invites</p>
                <p className="mt-1 text-xs text-slate-500">Friends will drop their Tic-Tac-Toe links here soon.</p>
              </div>
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-lg">
              <h3 className="font-bold text-white">How invites work</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">1</span>
                  <span>Hosts share their link from the left panel or paste it in chat.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">2</span>
                  <span>Invites will surface in this inbox so you can jump in instantly.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">3</span>
                  <span>Once accepted, you land directly on the live board as player O.</span>
                </li>
              </ul>
            </div>
          </section>
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
