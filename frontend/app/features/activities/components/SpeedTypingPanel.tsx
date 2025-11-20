import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UncopyableSnippet } from "./UncopyableSnippet";
import { useSpeedTypingSession, type LobbyParticipant } from "../hooks/useSpeedTypingSession";
import { attachTypingBoxGuards } from "../guards/typingBoxGuards";
import { useFriendIdentities } from "@/hooks/social/use-friend-identities";
import { readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { ActivityLobbySummary } from "./ActivityLobbySummary";

export const SpeedTypingPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const {
    state,
    typedText,
    setTypedText,
    metrics,
    submitted,
    submit,
    onKeyDown,
    markPasteDetected,
    textSample,
    toast: sessionToast,
    readyUp,
    unready,
    startCountdown,
    countdown,
    selfUserId,
  } = useSpeedTypingSession({ sessionId });

  const { map: friendIdentities, authUser: friendAuthSnapshot } = useFriendIdentities();
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => friendAuthSnapshot ?? readAuthUser());
  const [localToast, setLocalToast] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const blockNextChangeRef = useRef(false);
  const composingRef = useRef(false);

  useEffect(() => {
    setAuthUser(friendAuthSnapshot ?? readAuthUser());
  }, [friendAuthSnapshot]);

  useEffect(() => {
    if (!localToast) return;
    const id = setTimeout(() => setLocalToast(null), 2000);
    return () => clearTimeout(id);
  }, [localToast]);

  useEffect(() => {
    const ta = textAreaRef.current;
    if (!ta) return;
    const detach = attachTypingBoxGuards(ta);
    return () => detach();
  }, [markPasteDetected]);

  const formatHandle = useCallback((value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  }, []);

  const resolveDisplayName = useCallback(
    (userId: string, extras?: { displayName?: string | null; handle?: string | null }) => {
      if (authUser?.userId === userId) {
        const personal = authUser.displayName?.trim();
        return personal && personal.length > 0 ? personal : "You";
      }
      const friend = friendIdentities.get(userId);
      if (friend) {
        const friendly = friend.displayName?.trim();
        if (friendly) return friendly;
        const friendHandle = formatHandle(friend.handle);
        if (friendHandle) return friendHandle;
      }
      const lobbyDisplay = extras?.displayName?.trim();
      if (lobbyDisplay) return lobbyDisplay;
      const lobbyHandle = formatHandle(extras?.handle);
      if (lobbyHandle) return lobbyHandle;
      return userId;
    },
    [authUser?.displayName, authUser?.userId, friendIdentities, formatHandle],
  );

  const resolveSubtitle = useCallback(
    (userId: string, extras?: { handle?: string | null }) => {
      if (authUser?.userId === userId) {
        return formatHandle(authUser.handle) ?? undefined;
      }
      const friend = friendIdentities.get(userId);
      const friendHandle = formatHandle(friend?.handle);
      if (friendHandle) return friendHandle;
      const fallbackHandle = formatHandle(extras?.handle);
      return fallbackHandle ?? undefined;
    },
    [authUser?.handle, authUser?.userId, friendIdentities, formatHandle],
  );

  const participants: LobbyParticipant[] = useMemo(
    () => state.lobby?.participants ?? [],
    [state.lobby?.participants],
  );

  const participantMeta = useMemo(() => {
    const meta = new Map<string, { label: string; subtitle?: string }>();
    participants.forEach((p) => {
      meta.set(p.userId, {
        label: resolveDisplayName(p.userId, p),
        subtitle: resolveSubtitle(p.userId, p),
      });
    });
    return meta;
  }, [participants, resolveDisplayName, resolveSubtitle]);
  const hostUserId = participants[0]?.userId;
  const isHost = hostUserId != null && hostUserId === selfUserId;
  const readyCount = participants.filter((entry) => entry.ready).length;
  const joinedCount = participants.filter((entry) => entry.joined).length;
  const totalParticipants = participants.length;
  const allReady = totalParticipants > 0 && readyCount === totalParticipants;
  const selfPresence = participants.find((entry) => entry.userId === selfUserId);
  const readyButtonDisabled =
    state.phase === "idle" || state.phase === "connecting" || state.phase === "ended" || state.phase === "error";
  const countdownSeconds = countdown?.seconds ?? null;
  const countdownActive = state.phase === "countdown" && countdownSeconds !== null;
  const lobbyArmed = Boolean(state.lobby?.ready);

  const leader = useMemo(() => {
    if (!state.scoreboard || state.scoreboard.length === 0) return null;
    const sorted = [...state.scoreboard].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return sorted[0];
  }, [state.scoreboard]);
  const participantCards = useMemo(() => {
    type Entry = { userId: string; score?: number; displayName?: string | null; handle?: string | null };
    const list: Entry[] =
      state.scoreboard && state.scoreboard.length > 0
        ? state.scoreboard
        : participants.map((p) => ({ userId: p.userId, score: 0 }));
    return list.map((entry) => ({
      userId: entry.userId,
      label: participantMeta.get(entry.userId)?.label ?? resolveDisplayName(entry.userId, entry),
      subtitle: participantMeta.get(entry.userId)?.subtitle ?? resolveSubtitle(entry.userId, entry),
      score: entry.score ?? 0,
    }));
  }, [participantMeta, participants, resolveDisplayName, resolveSubtitle, state.scoreboard]);
  const winnerEntry = useMemo(() => {
    if (state.winnerUserId) {
      return state.scoreboard?.find((entry) => entry.userId === state.winnerUserId) ?? null;
    }
    return null;
  }, [state.scoreboard, state.winnerUserId]);
  const winnerLabel = useMemo(() => {
    if (!state.winnerUserId) return null;
    return resolveDisplayName(state.winnerUserId, winnerEntry ?? undefined);
  }, [resolveDisplayName, state.winnerUserId, winnerEntry]);

  const handleReadyClick = () => {
    if (readyButtonDisabled) return;
    if (selfPresence?.ready) {
      void unready();
    } else {
      void readyUp();
    }
  };

  const handleStartClick = () => {
    if (!isHost || !allReady || lobbyArmed || state.phase !== "lobby") return;
    void startCountdown();
  };

  const toast = sessionToast || localToast;

  let mainContent: React.ReactNode;

  if (countdownActive) {
    mainContent = (
      <div className="relative rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/80 backdrop-blur-sm">
          <div className="rounded-xl border border-amber-300 bg-white px-6 py-4 text-center shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">Countdown</p>
            <p className="text-6xl font-extrabold text-amber-800 leading-none">
              {Math.max(countdownSeconds ?? 0, 0)}
            </p>
            <p className="text-sm text-amber-700 mt-2">Starting soon for everyone</p>
          </div>
        </div>
        <div className="opacity-40 select-none">
          <UncopyableSnippet
            text={textSample}
            widthPx={560}
            font="14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            lineHeight={20}
            padding={12}
            antiOcrNoise={false}
          />
        </div>
      </div>
    );
  } else if (state.phase === "running") {
    mainContent = (
      <div className="relative">
        <div>
          <UncopyableSnippet
            text={textSample}
            widthPx={560}
            font="14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            lineHeight={20}
            padding={12}
            antiOcrNoise={false}
          />
          <textarea
            ref={textAreaRef}
            value={typedText}
            id="typing-box"
            placeholder="Start typing to duel"
            className="mt-3 h-32 w-full select-none rounded border border-slate-300 p-2"
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onChange={(e) => {
              if (blockNextChangeRef.current) {
                blockNextChangeRef.current = false;
                e.currentTarget.value = typedText;
                return;
              }
              const next = e.currentTarget.value;
              const delta = next.length - typedText.length;
              if (!composingRef.current) {
                if (delta > 1 || (delta === 0 && next !== typedText)) {
                  setLocalToast("Paste blocked");
                  markPasteDetected();
                  e.currentTarget.value = typedText;
                  return;
                }
              }
              setTypedText(next);
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V" || e.key === "Insert")) {
                e.preventDefault();
                setLocalToast("Paste blocked");
                markPasteDetected();
                blockNextChangeRef.current = true;
              }
              onKeyDown(e);
            }}
            onPaste={(e) => {
              e.preventDefault();
              markPasteDetected();
              setLocalToast("Paste blocked");
              blockNextChangeRef.current = true;
            }}
            disabled={submitted}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-gramm="false"
            data-gramm_editor="false"
            aria-label="Typing area"
          />
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-700">
            <div>WPM: {metrics.wpm.toFixed(1)}</div>
            <div>Accuracy: {(metrics.accuracy * 100).toFixed(0)}%</div>
            <div>Progress: {(metrics.progress * 100).toFixed(0)}%</div>
          </div>
          <div className="mt-3">
            <button
              onClick={submit}
              disabled={submitted}
              className="rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {submitted ? "Submitted" : "Submit"}
            </button>
            <p className="mt-1 text-xs text-slate-500">Submitting early is allowed; fastest perfect entry wins.</p>
          </div>
        </div>
      </div>
    );
  } else if (state.phase === "ended") {
    mainContent = (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-900">Session ended</p>
        {state.winnerUserId ? (
          <p className="text-sm text-emerald-700 font-semibold">Winner: {winnerLabel ?? state.winnerUserId}</p>
        ) : (
          <p className="text-sm text-slate-700">No winner (draw)</p>
        )}
      </div>
    );
  } else if (state.phase === "idle" || state.phase === "connecting") {
    mainContent = <p className="text-sm text-slate-600">Connecting to session…</p>;
  } else if (state.phase === "error") {
    mainContent = (
      <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        Session error: {state.error ?? "unknown_error"}
      </div>
    );
  } else {
    mainContent = (
      <div className="space-y-4">
        <header className="space-y-1">
          <h3 className="text-base font-semibold text-slate-800">Lobby ready check</h3>
          <p className="text-xs text-slate-500">
            Everyone joins and readies up. Once all players are ready the host can arm a 10 second countdown to begin the duel.
          </p>
        </header>
        <ul className="space-y-2">
          {participants.length === 0 ? (
            <li className="text-xs text-slate-500">Waiting for players…</li>
          ) : (
            participants.map((p) => (
              <li key={p.userId} className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm">
                <span>
                  <span className="block font-semibold text-slate-800">{participantMeta.get(p.userId)?.label ?? resolveDisplayName(p.userId, p)}</span>
                  {participantMeta.get(p.userId)?.subtitle ? (
                    <span className="text-[11px] text-slate-500">{participantMeta.get(p.userId)?.subtitle}</span>
                  ) : null}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {p.ready ? "Ready" : "Not ready"}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Phase</p>
          <p className="text-sm font-semibold text-slate-900">
            {state.phase === "countdown" ? "Countdown" : state.phase === "running" ? "Live" : state.phase === "ended" ? "Results" : "Lobby"}
          </p>
        </div>
        {state.phase === "running" || state.phase === "ended" ? null : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleReadyClick}
              disabled={readyButtonDisabled}
              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {selfPresence?.ready ? "Cancel ready" : "Ready up"}
            </button>
            <button
              onClick={handleStartClick}
              disabled={!isHost || !allReady || lobbyArmed || state.phase !== "lobby"}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isHost ? (lobbyArmed ? "Countdown armed" : "Start 10s countdown") : "Ready up to play"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Score lead</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {participantCards.map((entry) => (
            <div key={entry.userId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
              {entry.subtitle ? <p className="text-[11px] text-slate-500">{entry.subtitle}</p> : null}
              <p className="mt-1 text-xs text-slate-700">
                Score: <span className="font-semibold">{entry.score}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <ActivityLobbySummary
        countdownSeconds={countdownSeconds ?? null}
        lobbyReady={lobbyArmed || allReady}
        leaderLabel={leader ? resolveDisplayName(leader.userId, leader) : undefined}
        leaderScore={leader?.score}
        hostLabel={hostUserId ? resolveDisplayName(hostUserId, participants[0]) : undefined}
        joinedCount={joinedCount}
        readyCount={readyCount}
        totalParticipants={totalParticipants}
      />

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">{mainContent}</div>

      {toast ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">{toast}</div> : null}
      {state.phase === "ended" && winnerEntry ? (
        <div className="relative overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-emerald-100/40 via-white/30 to-emerald-100/40" />
          <div className="relative flex items-center gap-2">
            <span className="text-2xl animate-bounce">🏅</span>
            <span>
              Winner: {winnerLabel ?? resolveDisplayName(winnerEntry.userId, winnerEntry)} ({winnerEntry.score ?? 0} pts)
            </span>
            <span className="ml-auto text-xs text-emerald-700">+100 xp</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
