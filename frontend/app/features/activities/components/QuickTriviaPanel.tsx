"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuickTriviaSession, type TriviaState } from "../hooks/useQuickTriviaSession";
import { useFriendIdentities } from "@/hooks/social/use-friend-identities";
import { ActivityLobbySummary } from "./ActivityLobbySummary";

type QuickTriviaController = {
  state: TriviaState;
  selectOption: (idx: number) => void;
  toggleReady?: (ready: boolean) => void;
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
  const { state, selectOption, progress, toggleReady, countdownRemainingMs, questionMsRemaining, self } = controller;
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
    }));
  }, [resolveName, resolveSubtitle, state.presence, state.scoreboard]);

  const participants = state.presence || [];
  const joinedCount = participants.filter((p) => p.joined).length;
  const readyCount = participants.filter((p) => p.ready).length;
  const totalParticipants = participants.length || scoreCards.length;
  const hostUserId = participants[0]?.userId || scoreCards[0]?.userId;
  const hostLabel = hostUserId ? resolveName(hostUserId) : "—";
  const scoreLeader = scoreCards[0] ?? null;

  if (state.phase === "error" || state.error) {
    const isExpired = state.error?.toLowerCase().includes("no longer available");
    return (
      <div className="rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 space-y-2">
        <p>Session error: {state.error || "unable to join this duel."} Please start a new session or re-open a fresh invite.</p>
        {isExpired && onExpired ? (
          <button
            type="button"
            onClick={onExpired}
            className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-sky-500"
          >
            Start a new session
          </button>
        ) : null}
      </div>
    );
  }

  if (
    state.phase !== "running" &&
    state.phase !== "lobby" &&
    state.phase !== "ended" &&
    // Allow downstream TS to narrow when countdown pushes blur state
    (state.phase as string) !== "countdown"
  ) {
    return <div className="rounded border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">Waiting for round...</div>;
  }

  const lobby = (state.phase === "lobby" || (state.phase as string) === "countdown") && (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lobby</p>
          <p className="text-sm text-slate-700">Invite accepted. Ready up to start.</p>
        </div>
        {toggleReady ? (
          <button
            onClick={() => toggleReady(!(state.presence || []).find((p) => p.userId === self)?.ready)}
            className="rounded-full bg-sky-600 px-3 py-1 text-sm font-semibold text-white shadow hover:bg-sky-500"
            type="button"
          >
            {(state.presence || []).find((p) => p.userId === self)?.ready ? "Unready" : "Ready"}
          </button>
        ) : null}
      </div>
      <ul className="mt-3 space-y-2 text-sm text-slate-800">
        {(state.presence || []).map((p) => (
          <li key={p.userId} className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
              {p.userId === self ? "You" : "P"}
            </span>
            <span className="flex-1 truncate">
              <span className="block font-medium text-slate-800">{resolveName(p.userId)}</span>
              {resolveSubtitle(p.userId) ? (
                <span className="text-[11px] text-slate-500">{resolveSubtitle(p.userId)}</span>
              ) : null}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
              {p.ready ? "Ready" : "Not ready"}
            </span>
          </li>
        ))}
      </ul>
      {state.lobbyReady ? (
        <p className="mt-3 text-xs font-semibold text-emerald-600">Both ready. Countdown will start.</p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">Quick Trivia</h3>
        <meter
          min={0}
          max={1}
          value={progress}
          className="h-2 w-40 rounded bg-slate-100 [--meter-bg:theme(colors.sky.500)]"
        ></meter>
      </header>
      <ActivityLobbySummary
        countdownSeconds={countdownSeconds}
        lobbyReady={state.lobbyReady}
        leaderLabel={scoreLeader?.label}
        leaderScore={scoreLeader?.score}
        hostLabel={hostLabel}
        joinedCount={joinedCount}
        readyCount={readyCount}
        totalParticipants={totalParticipants || 2}
      />
      <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Score lead</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {scoreCards.map((card) => (
            <div key={card.userId} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">{card.label}</p>
              <p className="text-[11px] text-slate-500">{card.subtitle ?? card.userId}</p>
              <p className="mt-1 text-xs text-slate-700">
                Score: <span className="font-semibold">{card.score}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
      {lobby}
      <div className={`relative overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 p-4 shadow-sm ${blurActive ? "blur-[1px] transition" : ""}`}>
        {countdownSeconds && blurActive ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-white/85 backdrop-blur-sm">
            <div className="rounded-xl border border-amber-300 bg-white px-6 py-4 text-center shadow">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
                {state.countdown?.reason === "intermission" ? "Next round" : "Countdown"}
              </p>
              <p className="text-6xl font-extrabold text-amber-800 leading-none">{Math.max(countdownSeconds, 0)}</p>
              <p className="mt-2 text-sm text-amber-700">
                {state.countdown?.reason === "intermission" ? "Next question opens shortly" : "Starting soon for everyone"}
              </p>
            </div>
          </div>
        ) : null}
        <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>{roundNumber ? `Round ${roundNumber}` : "Get ready"}</span>
          {state.timeLimitMs ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${roundSecondsLeft !== null && roundSecondsLeft <= 2 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}
            >
              {roundSecondsLeft !== null ? `${roundSecondsLeft}s left` : `${Math.round(state.timeLimitMs / 1000)}s limit`}
            </span>
          ) : null}
        </div>
        <div className="mb-3 text-sm text-slate-800">{state.question || "..."}</div>
        <fieldset className="grid gap-2" disabled={Boolean(state.locked) || Boolean(blurActive)}>
          {(state.options || []).map((opt, idx) => {
            const isSelected = state.selectedIndex === idx;
            const isCorrect = state.correctIndex === idx;
            const baseClasses = "rounded-lg border px-3 py-2 text-sm transition-colors";
            const className = isCorrect
              ? `${baseClasses} border-emerald-300 bg-emerald-50 text-emerald-900`
              : `${baseClasses} border-slate-200 bg-white hover:border-slate-300`;
            return (
              <label key={idx} className={className}>
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="quick-trivia-choice"
                    className="h-4 w-4"
                    checked={isSelected}
                    onChange={() => selectOption(idx)}
                    disabled={Boolean(state.locked) || Boolean(blurActive)}
                  />
                  <span className="flex-1 text-left">{opt}</span>
                  {state.locked && isSelected ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      Locked
                    </span>
                  ) : null}
                  {state.correctIndex !== undefined && isCorrect ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Correct
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="mt-3 text-[11px] text-slate-500">Questions auto-advance once you answer or when the 7-second timer expires.</p>
      </div>
      {state.phase === "ended" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
          <p className="font-semibold text-slate-900">Results</p>
          {state.tieBreakWinnerUserId ? (
            <p className="text-emerald-700 font-semibold">
              Winner by time advantage: {resolveName(state.tieBreakWinnerUserId)}
            </p>
          ) : state.winnerUserId ? (
            <p className="text-emerald-700 font-semibold">Winner: {resolveName(state.winnerUserId)}</p>
          ) : (
            <p className="text-slate-700">It&apos;s a tie!</p>
          )}
          <div className="mt-3 space-y-2">
            {state.scoreboard.map((row) => {
              const tally = state.tally?.[row.userId];
              return (
                <div key={row.userId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      <span className="block font-medium text-slate-900">{resolveName(row.userId)}</span>
                      {resolveSubtitle(row.userId) ? (
                        <span className="text-[11px] text-slate-500">{resolveSubtitle(row.userId)}</span>
                      ) : null}
                    </span>
                    <span className="text-base font-semibold text-slate-900">{row.score} pts</span>
                  </div>
                  {tally ? (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                      <span>right {tally.correct}</span>
                      <span>wrong {tally.wrong}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
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
