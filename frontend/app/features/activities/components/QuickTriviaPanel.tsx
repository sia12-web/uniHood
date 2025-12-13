"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuickTriviaSession, type TriviaState } from "../hooks/useQuickTriviaSession";
import { useFriendIdentities } from "@/hooks/social/use-friend-identities";
import { Trophy, Timer, Zap, Users, CheckCircle2, XCircle, AlertCircle, Clock, Lock, LogOut, AlertTriangle } from "lucide-react";
import { MyPointsBadge } from "./MyPointsBadge";

type QuickTriviaController = {
  state: TriviaState;
  selectOption: (idx: number) => void;
  toggleReady?: (ready: boolean) => void;
  leave?: () => void;
  progress: number;
  countdownRemainingMs?: number;
  questionMsRemaining?: number;
  self?: string;
};

type QuickTriviaPanelViewProps = {
  controller: QuickTriviaController;
  onExpired?: () => void;
};

export const QuickTriviaPanelView: React.FC<QuickTriviaPanelViewProps> = ({ controller, onExpired }) => {
  const { state, selectOption, progress, toggleReady, leave, countdownRemainingMs, questionMsRemaining, self } = controller;
  const { map: friendIdentities, authUser } = useFriendIdentities();

  const countdownSeconds = countdownRemainingMs ? Math.ceil(countdownRemainingMs / 1000) : null;
  const blurActive = (state.phase as string) === "countdown" || (countdownRemainingMs && countdownRemainingMs > 0);
  const roundSecondsLeft = typeof questionMsRemaining === "number" && questionMsRemaining > 0 ? Math.ceil(questionMsRemaining / 1000) : null;
  const roundNumber = typeof state.currentRound === "number" && state.currentRound >= 0 ? state.currentRound + 1 : null;

  const formatHandle = useCallback((value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  }, []);

  const resolveName = useCallback(
    (userId: string) => {
      if (authUser?.userId === userId) {
        const personal = authUser.displayName?.trim();
        return personal && personal.length > 0 ? personal : "You";
      }
      if (userId === self) {
        return "You";
      }
      const friend = friendIdentities.get(userId);
      if (friend) {
        const friendly = friend.displayName?.trim();
        if (friendly) return friendly;
        const friendHandle = formatHandle(friend.handle);
        if (friendHandle) return friendHandle;
      }
      return userId;
    },
    [authUser?.displayName, authUser?.userId, friendIdentities, formatHandle, self],
  );

  const resolveSubtitle = useCallback(
    (userId: string) => {
      if (authUser?.userId === userId) {
        return formatHandle(authUser.handle);
      }
      const friend = friendIdentities.get(userId);
      if (friend) {
        const friendHandle = formatHandle(friend.handle);
        if (friendHandle) return friendHandle;
      }
      return null;
    },
    [authUser?.handle, authUser?.userId, friendIdentities, formatHandle],
  );

  const scoreCards = useMemo(() => {
    const list: Array<{ userId: string; score?: number }> =
      (state.scoreboard && state.scoreboard.length > 0
        ? state.scoreboard
        : (state.presence || []).map((p) => ({ userId: p.userId, score: 0 }))) || [];
    return list.map((row) => ({
      userId: row.userId,
      label: resolveName(row.userId),
      subtitle: resolveSubtitle(row.userId),
      score: typeof row.score === "number" ? row.score : 0,
      isReady: (state.presence || []).find(p => p.userId === row.userId)?.ready ?? false,
      isSelf: row.userId === self,
    }));
  }, [resolveName, resolveSubtitle, state.presence, state.scoreboard, self]);

  const participants = state.presence || [];
  const readyCount = participants.filter((p) => p.ready).length;
  const totalParticipants = participants.length || scoreCards.length;
  const allReady = totalParticipants > 0 && readyCount === totalParticipants;
  const selfPresence = participants.find((p) => p.userId === self);
  const lobbyArmed = state.lobbyReady;

  // --- Render Helpers ---

  const renderLobby = () => (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {scoreCards.map((p) => (
          <div
            key={p.userId}
            className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${p.isReady
              ? "border-amber-200 bg-amber-50/50 ring-1 ring-amber-500/20"
              : "border-slate-200 bg-white"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${p.isReady ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}>
                  {p.label.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-slate-900">
                    {p.label} {p.isSelf && <span className="text-xs font-normal text-slate-500">(You)</span>}
                  </div>
                  {p.subtitle && <div className="text-xs text-slate-500">{p.subtitle}</div>}
                </div>
              </div>
              {p.isReady ? (
                <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                  <Timer className="h-3.5 w-3.5" />
                  Waiting
                </div>
              )}
            </div>
          </div>
        ))}
        {scoreCards.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-400">
            <Users className="mb-2 h-8 w-8 opacity-50" />
            <p>Waiting for players to join...</p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center gap-4 border-t border-slate-100 pt-8">
        <div className="flex items-center gap-3">
          {toggleReady && (
            <button
              onClick={() => toggleReady(!selfPresence?.ready)}
              className={`group relative flex items-center gap-2 overflow-hidden rounded-xl px-8 py-3 font-bold transition-all ${selfPresence?.ready
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 hover:shadow-indigo-500/40"
                }`}
            >
              {selfPresence?.ready ? (
                <>
                  <XCircle className="h-5 w-5" />
                  Cancel Ready
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  I&apos;m Ready
                </>
              )}
            </button>
          )}
        </div>

        <div className="text-xs font-medium text-slate-400">
          {lobbyArmed
            ? "Game starting in moments..."
            : allReady
              ? "All players ready! Starting soon..."
              : `Waiting for ${totalParticipants - readyCount} player(s) to ready up`
          }
        </div>

        {leave && (
          <button
            onClick={leave}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-rose-500 transition-colors mt-2"
          >
            <LogOut className="h-4 w-4" />
            Leave Game
          </button>
        )}
      </div>
    </div>
  );

  const renderCountdown = () => (
    <div className="relative flex flex-col items-center justify-center py-12">
      <div className="relative z-10 flex h-40 w-40 items-center justify-center rounded-full bg-white shadow-2xl ring-4 ring-amber-50">
        <span className="text-8xl font-black tracking-tighter text-amber-600">
          {Math.max(countdownSeconds ?? 0, 0)}
        </span>
      </div>
      <div className="mt-8 text-center">
        <h3 className="text-2xl font-bold text-slate-900">
          {state.countdown?.reason === "intermission" ? "Next Round" : "Get Ready!"}
        </h3>
        <p className="text-slate-500">
          {state.countdown?.reason === "intermission" ? "Prepare for the next question" : "The trivia battle is about to begin"}
        </p>
      </div>
    </div>
  );

  const renderRunning = () => (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        {/* Question Card */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600">
              <Zap className="h-3.5 w-3.5" />
              Round {roundNumber}
            </div>
            {state.timeLimitMs && (
              <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold transition-colors ${roundSecondsLeft !== null && roundSecondsLeft <= 3
                ? "bg-rose-100 text-rose-600 animate-pulse"
                : "bg-slate-100 text-slate-600"
                }`}>
                <Clock className="h-3.5 w-3.5" />
                {roundSecondsLeft !== null ? `${roundSecondsLeft}s` : `${Math.round(state.timeLimitMs / 1000)}s`}
              </div>
            )}
          </div>

          <h3 className="mb-8 text-2xl font-bold leading-tight text-slate-900 md:text-3xl">
            {state.question || "Loading question..."}
          </h3>

          <div className="grid gap-3">
            {(state.options || []).map((opt, idx) => {
              const isSelected = state.selectedIndex === idx;
              const isCorrect = state.correctIndex === idx;
              const showResult = state.correctIndex !== undefined;
              const optionLabel = typeof opt === "string" && opt.trim().length > 0 ? opt.trim() : `Option ${idx + 1}`;

              let cardClass = "border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-white";
              let textClass = "text-slate-700";
              let badge: React.ReactNode = null;

              if (showResult) {
                if (isCorrect) {
                  cardClass = "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500";
                  textClass = "text-emerald-900 font-bold";
                  badge = (
                    <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                      Correct
                    </span>
                  );
                } else if (isSelected) {
                  cardClass = "border-rose-500 bg-rose-50 ring-1 ring-rose-500";
                  textClass = "text-rose-900 font-bold";
                  badge = (
                    <span className="flex items-center gap-1 text-sm font-semibold text-rose-600">
                      <XCircle className="h-5 w-5" />
                      Wrong
                    </span>
                  );
                } else {
                  cardClass = "border-slate-100 bg-slate-50 opacity-50";
                }
              } else if (isSelected) {
                cardClass = "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600";
                textClass = "text-indigo-900 font-bold";
              }

              return (
                <button
                  key={idx}
                  onClick={() => !state.locked && selectOption(idx)}
                  disabled={Boolean(state.locked) || Boolean(blurActive)}
                  aria-label={optionLabel}
                  className={`group relative flex w-full items-center justify-between rounded-xl border-2 p-4 text-left transition-all ${cardClass}`}
                >
                  <span className={`text-lg ${textClass}`}>{opt}</span>
                  {badge}
                </button>
              );
            })}
            {state.locked ? (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Lock className="h-3.5 w-3.5" />
                Locked
              </div>
            ) : null}
          </div>

          {/* Progress Bar */}
          <meter
            min={0}
            max={1}
            value={progress}
            className="absolute bottom-0 left-0 h-1.5 w-full appearance-none bg-slate-100 [&::-webkit-meter-bar]:bg-slate-100 [&::-webkit-meter-optimum-value]:bg-indigo-600 [&::-webkit-meter-suboptimum-value]:bg-indigo-600 [&::-webkit-meter-even-less-good-value]:bg-indigo-600 [&::-moz-meter-bar]:bg-slate-100 [&:-moz-meter-optimum]:bg-indigo-600"
          />
        </div>
      </div>

      {/* Live Leaderboard */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Live Standings</h3>
        <div className="space-y-2">
          {scoreCards
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .map((p, i) => (
              <div key={p.userId} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-900/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{p.label}</div>
                    <div className="text-xs text-slate-500">{p.score} pts</div>
                  </div>
                </div>
                {i === 0 && p.score > 0 && <Trophy className="h-4 w-4 text-amber-400" />}
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  const opponentLeft = state.leaveReason === 'opponent_left';

  const renderResults = () => {
    const selfUserId = self || authUser?.userId;
    const didWin = state.winnerUserId === selfUserId || state.tieBreakWinnerUserId === selfUserId;
    const earnedPoints = (didWin || opponentLeft) ? 200 : 50;

    return (
      <div className="text-center">
        {/* Opponent Left Banner */}
        {opponentLeft && (
          <div className="mb-6 mx-auto max-w-md flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="text-left">
              <p className="font-semibold">Your opponent left the game</p>
              <p className="text-sm text-amber-600">You win by forfeit!</p>
            </div>
          </div>
        )}

        <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-8 ring-amber-50">
          <Trophy className="h-10 w-10" />
        </div>

        <h2 className="text-3xl font-bold text-slate-900">
          {opponentLeft ? "You Win!" : (didWin ? "You Won!" : "Trivia Complete!")}
        </h2>

        {!opponentLeft && state.tieBreakWinnerUserId ? (
          <div className="mt-2 text-lg text-slate-600">
            <span className="font-bold text-amber-600">{resolveName(state.tieBreakWinnerUserId)}</span> won by speed!
            <p className="sr-only">Winner by time advantage: {resolveName(state.tieBreakWinnerUserId)}</p>
          </div>
        ) : state.winnerUserId && !didWin ? (
          <div className="mt-2 text-lg text-slate-600">
            <span className="font-bold text-amber-600">{resolveName(state.winnerUserId)}</span> won the match!
          </div>
        ) : !didWin && !opponentLeft ? (
          <div className="mt-2 text-lg text-slate-600">It was a tie!</div>
        ) : null}

        {/* YOUR POINTS EARNED - Large prominent display */}
        <div className="mt-8 mx-auto max-w-sm">
          <div className={`rounded-2xl p-6 ${didWin || opponentLeft
            ? "bg-gradient-to-br from-emerald-500 to-teal-600"
            : "bg-gradient-to-br from-slate-600 to-slate-700"
            } text-white shadow-xl`}>
            <div className="text-sm font-medium uppercase tracking-wider opacity-80">
              You Earned
            </div>
            <div className="mt-2 flex items-baseline justify-center gap-2">
              <span className="text-5xl font-black">{earnedPoints}</span>
              <span className="text-xl font-semibold opacity-80">points</span>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-sm opacity-90">
              {didWin || opponentLeft ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>+1 Win added to your stats</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <span>+1 Game added to your stats</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Final Standings */}
        <div className="mx-auto mt-8 max-w-md space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Final Standings</h3>
          {scoreCards
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .map((p, i) => {
              const tally = state.tally?.[p.userId];
              const isWinner = p.userId === state.winnerUserId || p.userId === state.tieBreakWinnerUserId || (opponentLeft && p.isSelf);
              const fixedPoints = isWinner ? 200 : 50;

              return (
                <div
                  key={p.userId}
                  className={`flex flex-col gap-2 rounded-xl border p-4 ${i === 0 ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"
                    } ${p.isSelf ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`text-lg font-bold ${i === 0 ? "text-emerald-600" : "text-slate-400"}`}>#{i + 1}</span>
                      <div className="text-left">
                        <div className="font-bold text-slate-900">
                          {p.label} {p.isSelf && <span className="text-xs font-normal text-indigo-500">(You)</span>}
                        </div>
                        <div className="text-xs text-slate-500">{p.subtitle}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-bold text-slate-900">{fixedPoints}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Points</div>
                    </div>
                  </div>

                  {tally && (
                    <div className="flex gap-4 border-t border-slate-200/50 pt-2 text-xs font-medium">
                      <span className="text-emerald-600">{tally.correct} Correct</span>
                      <span className="text-rose-600">{tally.wrong} Wrong</span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {onExpired && (
          <button
            onClick={onExpired}
            className="mt-8 rounded-full bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-lg hover:bg-slate-800"
          >
            Start New Game
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Phase Indicator */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-6">
        <div className="flex items-center gap-2">
          <div className={`flex h-2.5 w-2.5 rounded-full ${state.phase === "running" ? "animate-pulse bg-rose-500" :
            state.phase === "countdown" ? "bg-amber-500" :
              state.phase === "ended" ? "bg-emerald-500" : "bg-slate-300"
            }`} />
          <span className="text-sm font-bold uppercase tracking-wider text-slate-500">
            {state.phase === "countdown" ? "Starting..." :
              state.phase === "running" ? "Trivia in Progress" :
                state.phase === "ended" ? "Final Results" : "Lobby"}
          </span>
        </div>

        {state.phase === "running" && (
          <div className="flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">
            <div className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
            LIVE
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="min-h-[400px]">
        {state.phase === "error" || state.error ? (
          <div className="flex flex-col items-center justify-center py-12 text-rose-600">
            <AlertCircle className="mb-4 h-12 w-12 opacity-20" />
            <p className="font-medium">Connection Error</p>
            <p className="text-sm opacity-80">{state.error ?? "Unknown error occurred"}</p>
            {onExpired && (
              <button
                onClick={onExpired}
                className="mt-4 rounded-full bg-rose-100 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-200"
              >
                Reset Session
              </button>
            )}
          </div>
        ) : countdownSeconds && blurActive ? (
          renderCountdown()
        ) : state.phase === "running" ? (
          renderRunning()
        ) : state.phase === "ended" ? (
          renderResults()
        ) : (
          renderLobby()
        )}
      </div>
    </div>
  );
};

export const QuickTriviaPanel: React.FC<{ sessionId: string; onExpired?: () => void }> = ({ sessionId, onExpired }) => {
  const controller = useQuickTriviaSession({ sessionId });
  const expiredNotifiedRef = useRef(false);

  useEffect(() => {
    if (!onExpired) return;
    const message = controller.state.error?.toLowerCase() ?? "";
    const sessionGone = message.includes("no longer available") || message.includes("session expired");
    if (sessionGone && !expiredNotifiedRef.current) {
      expiredNotifiedRef.current = true;
      onExpired();
    } else if (!sessionGone) {
      expiredNotifiedRef.current = false;
    }
  }, [controller.state.error, onExpired]);

  return <QuickTriviaPanelView controller={controller} onExpired={onExpired} />;
};
