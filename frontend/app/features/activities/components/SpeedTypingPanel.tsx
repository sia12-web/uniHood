import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UncopyableSnippet } from "./UncopyableSnippet";
import { useSpeedTypingSession, type LobbyParticipant } from "../hooks/useSpeedTypingSession";
import { attachTypingBoxGuards } from "../guards/typingBoxGuards";
import { useFriendIdentities } from "@/hooks/social/use-friend-identities";
import { readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { Trophy, Timer, Users, CheckCircle2, XCircle, Play, AlertCircle, LogOut, AlertTriangle } from "lucide-react";

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
    leave,
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
  const totalParticipants = participants.length;
  const allReady = totalParticipants > 0 && readyCount === totalParticipants;
  const selfPresence = participants.find((entry) => entry.userId === selfUserId);
  const readyButtonDisabled =
    state.phase === "idle" || state.phase === "connecting" || state.phase === "ended" || state.phase === "error";
  const countdownSeconds = countdown?.seconds ?? null;
  const countdownActive = state.phase === "countdown" && countdownSeconds !== null;
  const lobbyArmed = Boolean(state.lobby?.ready);
  const isConnecting = state.phase === "connecting" || state.phase === "idle";

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
      isReady: participants.find(p => p.userId === entry.userId)?.ready ?? false,
      isSelf: entry.userId === selfUserId,
    }));
  }, [participantMeta, participants, resolveDisplayName, resolveSubtitle, state.scoreboard, selfUserId]);

  const winnerEntry = useMemo(() => {
    if (state.winnerUserId) {
      return state.scoreboard?.find((entry) => entry.userId === state.winnerUserId) ?? null;
    }
    return null;
  }, [state.scoreboard, state.winnerUserId]);

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

  // --- Render Helpers ---

  const renderLobby = () => (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {participantCards.map((p) => (
          <div
            key={p.userId}
            className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${p.isReady
              ? "border-emerald-200 bg-emerald-50/50 ring-1 ring-emerald-500/20"
              : "border-slate-200 bg-white"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${p.isReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
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
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
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
        {participantCards.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-400">
            <Users className="mb-2 h-8 w-8 opacity-50" />
            <p>Waiting for players to join...</p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center gap-4 border-t border-slate-100 pt-8">
        <div className="flex items-center gap-3">
          <button
            onClick={handleReadyClick}
            disabled={readyButtonDisabled}
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

          {isHost && (
            <button
              onClick={handleStartClick}
              disabled={!allReady || lobbyArmed}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg shadow-emerald-500/30 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <Play className="h-5 w-5 fill-current" />
              {lobbyArmed ? "Starting..." : "Start Duel"}
            </button>
          )}
        </div>

        <div className="text-xs font-medium text-slate-400">
          {lobbyArmed
            ? "Game starting in moments..."
            : allReady
              ? isHost ? "All players ready! You can start." : "Waiting for host to start..."
              : `Waiting for ${totalParticipants - readyCount} player(s) to ready up`
          }
        </div>

        <button
          onClick={leave}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-rose-500 transition-colors mt-2"
        >
          <LogOut className="h-4 w-4" />
          Leave Game
        </button>
      </div>
    </div>
  );

  const renderCountdown = () => (
    <div className="relative flex flex-col items-center justify-center py-12">
      <div className="relative z-10 flex h-40 w-40 items-center justify-center rounded-full bg-white shadow-2xl ring-4 ring-indigo-50">
        <span className="text-8xl font-black tracking-tighter text-indigo-600">
          {Math.max(countdownSeconds ?? 0, 0)}
        </span>
      </div>
      <div className="mt-8 text-center">
        <h3 className="text-2xl font-bold text-slate-900">Get Ready!</h3>
        <p className="text-slate-500">Keep your fingers on the home row.</p>
      </div>

      {/* Blurred preview of text */}
      <div className="mt-12 w-full max-w-2xl select-none opacity-30 blur-sm filter">
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

  const renderRunning = () => (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <UncopyableSnippet
            text={textSample}
            widthPx={560}
            font="16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            lineHeight={28}
            padding={24}
            antiOcrNoise={false}
          />
        </div>

        <div className="relative">
          <textarea
            ref={textAreaRef}
            value={typedText}
            id="typing-box"
            placeholder="Start typing..."
            className="h-40 w-full resize-none rounded-2xl border-2 border-indigo-100 bg-indigo-50/30 p-6 font-mono text-lg leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
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
          />

          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-6 text-sm font-medium text-slate-600">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">WPM</span>
                <span className="text-xl font-bold text-slate-900">{metrics.wpm.toFixed(1)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Accuracy</span>
                <span className="text-xl font-bold text-slate-900">{(metrics.accuracy * 100).toFixed(0)}%</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Progress</span>
                <span className="text-xl font-bold text-slate-900">{(metrics.progress * 100).toFixed(0)}%</span>
              </div>
            </div>

            <button
              onClick={submit}
              disabled={submitted}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {submitted ? "Submitted" : "Submit Result"}
            </button>
          </div>
        </div>
      </div>

      {/* Live Leaderboard */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Live Standings</h3>
        <div className="space-y-2">
          {participantCards
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

  const didWin = useMemo(() => {
    if (!state.winnerUserId) return false;
    return state.winnerUserId === selfUserId;
  }, [state.winnerUserId, selfUserId]);

  // Fixed points for leaderboard: 200 for winner (50 played + 150 win bonus), 50 for loser
  const earnedPoints = (didWin || opponentLeft) ? 200 : 50;

  const renderResults = () => (
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

      {/* Trophy Icon */}
      <div className={`mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full ring-8 ${didWin || opponentLeft
        ? "bg-emerald-100 text-emerald-600 ring-emerald-50"
        : "bg-rose-100 text-rose-600 ring-rose-50"
        }`}>
        <Trophy className="h-10 w-10" />
      </div>

      {/* Win/Loss Status */}
      <h2 className="text-3xl font-bold text-slate-900">
        {opponentLeft ? "You Win!" : didWin ? "Victory!" : "Game Over"}
      </h2>

      {!opponentLeft && winnerEntry ? (
        <div className="mt-2 text-lg text-slate-600">
          <span className="font-bold text-emerald-600">{resolveDisplayName(winnerEntry.userId, winnerEntry)}</span> won the match!
        </div>
      ) : !opponentLeft && !didWin ? (
        <div className="mt-2 text-lg text-slate-600">Better luck next time!</div>
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
                <span>+1 Game played</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* All Participants Scores */}
      <div className="mx-auto mt-8 max-w-md space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Final Standings</h3>
        {participantCards
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .map((p, i) => {
            // Calculate fixed leaderboard points for each participant
            const isWinner = p.userId === state.winnerUserId || (opponentLeft && p.isSelf);
            const fixedPoints = isWinner ? 200 : 50;

            return (
              <div
                key={p.userId}
                className={`flex items-center justify-between rounded-xl border p-4 ${i === 0
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-slate-200 bg-white"
                  } ${p.isSelf ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
              >
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
            );
          })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Phase Indicator */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-6">
        <div className="flex items-center gap-2">
          <div className={`flex h-2.5 w-2.5 rounded-full ${state.phase === "running" ? "animate-pulse bg-rose-500" :
            state.phase === "countdown" ? "bg-amber-500" :
              state.phase === "ended" ? "bg-emerald-500" :
                isConnecting ? "animate-pulse bg-slate-400" : "bg-slate-300"
            }`} />
          <span className="text-sm font-bold uppercase tracking-wider text-slate-500">
            {isConnecting
              ? "Connecting..."
              : state.phase === "countdown"
                ? "Starting..."
                : state.phase === "running"
                  ? "Duel in Progress"
                  : state.phase === "ended"
                    ? "Final Results"
                    : "Lobby"}
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
        {state.phase === "error" ? (
          <div className="flex flex-col items-center justify-center py-12 text-rose-600">
            <AlertCircle className="mb-4 h-12 w-12 opacity-20" />
            <p className="font-medium">Connection Error</p>
            <p className="text-sm opacity-80">{state.error ?? "Unknown error occurred"}</p>
          </div>
        ) : isConnecting ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Timer className="h-5 w-5" />
            </div>
            <p className="text-base font-semibold text-slate-700">Connecting to session...</p>
            <p className="text-sm text-slate-500">Hang tight while we sync your duel lobby.</p>
          </div>
        ) : countdownActive ? (
          renderCountdown()
        ) : state.phase === "running" ? (
          renderRunning()
        ) : state.phase === "ended" ? (
          renderResults()
        ) : (
          renderLobby()
        )}
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 transform rounded-full bg-slate-900/90 px-6 py-3 text-sm font-medium text-white shadow-xl backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
