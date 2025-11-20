import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSpeedTypingSession, SessionPhase } from '../hooks/useSpeedTypingSession';
import { SpeedTypingPanel } from './SpeedTypingPanel';
import { ScoreboardMini } from './ScoreboardMini';
import { QuickTriviaPanelView } from './QuickTriviaPanel';
import { PenaltyBanner } from './PenaltyBanner';
import { useQuickTriviaSession } from '../hooks/useQuickTriviaSession';

interface Props { sessionId: string; opponentUserId?: string; activityKey?: 'speed_typing' | 'quick_trivia'; onEnded?(): void; }

type NormalizedStage = 'lobby' | 'countdown' | 'running' | 'ended';

const stageLabels: Record<NormalizedStage, string> = {
  lobby: 'Lobby',
  countdown: 'Countdown',
  running: 'Live',
  ended: 'Results',
};

const stageBadgeStyles: Record<NormalizedStage, string> = {
  lobby: 'border-slate-200 bg-slate-100 text-slate-700',
  countdown: 'border-amber-200 bg-amber-50 text-amber-700 animate-pulse',
  running: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ended: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

const stageOrder: NormalizedStage[] = ['lobby', 'countdown', 'running', 'ended'];

const normalizeSpeedPhase = (phase: SessionPhase): NormalizedStage => {
  if (phase === 'ended') return 'ended';
  if (phase === 'running') return 'running';
  if (phase === 'countdown') return 'countdown';
  return 'lobby';
};

const normalizeTriviaPhase = (phase: import('../hooks/useQuickTriviaSession').TriviaState['phase']): NormalizedStage => {
  if (phase === 'ended') return 'ended';
  if (phase === 'running') return 'running';
  return 'lobby';
};

const resolveParticipantName = (
  participant: { userId: string; score: number } | (import('../hooks/useSpeedTypingSession').ScoreboardEntry) | undefined,
): string | undefined => {
  if (!participant) {
    return undefined;
  }
  if ('displayName' in participant && participant.displayName) {
    const trimmed = participant.displayName.trim();
    if (trimmed) return trimmed;
  }
  if ('handle' in participant && participant.handle) {
    const trimmed = participant.handle.trim();
    if (trimmed) return trimmed;
  }
  return participant.userId;
};

const qualityDot: Record<string, string> = {
  Good: 'bg-emerald-400',
  Fair: 'bg-amber-400',
  Poor: 'bg-rose-500',
};

export const LiveSessionShell: React.FC<Props> = ({ sessionId, activityKey = 'speed_typing', onEnded }) => {
  // Always call hook to satisfy rules-of-hooks; internally it will stay idle if sessionId missing.
  const typingHook = useSpeedTypingSession({ sessionId });
  const triviaHook = useQuickTriviaSession({ sessionId: activityKey === 'quick_trivia' ? sessionId : undefined });

  const isSpeedTyping = activityKey === 'speed_typing';
  const speedState = typingHook.state;
  const triviaState = triviaHook.state;
  const activeScoreboard = isSpeedTyping ? speedState.scoreboard : triviaState.scoreboard;

  const normalizedStage: NormalizedStage = isSpeedTyping
    ? normalizeSpeedPhase(speedState.phase)
    : normalizeTriviaPhase(triviaState.phase);

  const countdownInfo = isSpeedTyping ? typingHook.countdown : undefined;
  const connectionInfo = isSpeedTyping ? typingHook.connection : undefined;

  const phaseLabel = stageLabels[normalizedStage];
  const phaseBadge = stageBadgeStyles[normalizedStage];
  const currentSessionKey = isSpeedTyping ? speedState.sessionId : triviaState.sessionId;
  const [visitedStages, setVisitedStages] = useState<NormalizedStage[]>(() => (stageOrder.includes(normalizedStage) ? [normalizedStage] : []));
  const lastSessionKeyRef = useRef<string | undefined>(currentSessionKey);

  useEffect(() => {
    const sessionChanged = currentSessionKey !== lastSessionKeyRef.current;
    if (sessionChanged) {
      lastSessionKeyRef.current = currentSessionKey;
      setVisitedStages(stageOrder.includes(normalizedStage) ? [normalizedStage] : []);
      return;
    }
    setVisitedStages((prev) => {
      if (!stageOrder.includes(normalizedStage)) {
        return prev;
      }
      if (prev.includes(normalizedStage)) {
        return prev;
      }
      return [...prev, normalizedStage];
    });
  }, [currentSessionKey, normalizedStage]);

  // Dynamic highlight: during running show current leader; when ended show winner.
  const highlightWinnerId = isSpeedTyping
    ? speedState.phase === 'ended'
      ? (speedState.winnerUserId || speedState.scoreboard[0]?.userId)
      : speedState.phase === 'running'
        ? speedState.scoreboard[0]?.userId
        : undefined
    : triviaState.tieBreakWinnerUserId || triviaState.winnerUserId;

  const winnerParticipant = highlightWinnerId
    ? activeScoreboard.find((entry) => entry.userId === highlightWinnerId) ?? activeScoreboard[0]
    : activeScoreboard[0];
  const winnerName = resolveParticipantName(winnerParticipant);
  const scoreboardStatusLabel = normalizedStage === 'ended'
    ? 'Final'
    : normalizedStage === 'running'
      ? 'Live'
      : normalizedStage === 'countdown'
        ? 'Ready'
        : undefined;

  const [showWinnerOverlay, setShowWinnerOverlay] = useState(false);
  useEffect(() => {
    if (normalizedStage === 'ended' && winnerName) {
      setShowWinnerOverlay(true);
      const timeout = setTimeout(() => setShowWinnerOverlay(false), 4200);
      return () => clearTimeout(timeout);
    }
    setShowWinnerOverlay(false);
    return undefined;
  }, [normalizedStage, winnerName]);

  const countdownSeconds = countdownInfo?.seconds;
  const showCountdownOverlay = Boolean(isSpeedTyping && speedState.phase === 'countdown' && countdownSeconds != null);

  const stageMarkers = useMemo(() => stageOrder, []);

  const showPenalty = isSpeedTyping && Boolean(speedState.penalty?.message);

  const winnerSubtitle = isSpeedTyping
    ? 'Points awarded to the fastest typist.'
    : highlightWinnerId && triviaState.tieBreakWinnerUserId === highlightWinnerId
      ? 'Tie-break median response time decided the winner.'
      : 'Points awarded for top trivia score.';

  const mainPanel = isSpeedTyping
    ? <SpeedTypingPanel sessionId={sessionId} />
    : <QuickTriviaPanelView controller={triviaHook} />;

  const activeRoundIndex = isSpeedTyping ? speedState.currentRound : triviaState.currentRound;

  return (
    <div className="relative">
      {/* Auto-close the session a few seconds after end and winner overlay */}
      {normalizedStage === 'ended' && onEnded && showWinnerOverlay ? (
        <AutoClose onEnded={onEnded} delayMs={5200} />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3 space-y-4">
          <header className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-500">
                <span>Phase</span>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${phaseBadge}`}>
                  {phaseLabel}
                  {normalizedStage !== 'lobby' && activeRoundIndex != null ? (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.4em] text-slate-500">
                      Round {(activeRoundIndex ?? 0) + 1}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {connectionInfo?.quality ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-transparent bg-slate-100 px-2 py-1 font-medium text-slate-600">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${qualityDot[connectionInfo.quality] ?? 'bg-slate-300'}`} />
                    <span className="uppercase tracking-wide">{connectionInfo.quality}</span>
                    {typeof connectionInfo.rttMs === 'number' ? (
                      <span className="font-mono text-[10px] text-slate-500">~{Math.round(connectionInfo.rttMs)}ms</span>
                    ) : null}
                  </span>
                ) : null}
                {normalizedStage === 'ended' && onEnded ? (
                  <button
                    type="button"
                    onClick={onEnded}
                    className="text-xs font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline"
                  >
                    Close
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-400">
              {stageMarkers.map((stage, idx) => {
                const visited = visitedStages.includes(stage);
                const status = stage === normalizedStage ? 'active' : visited ? 'complete' : 'upcoming';
                const circleClass =
                  status === 'complete'
                    ? 'bg-emerald-500 text-white'
                    : status === 'active'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-500';
                const nextStage = stageMarkers[idx + 1];
                const barCompleted = visited && nextStage ? visitedStages.includes(nextStage) || nextStage === normalizedStage : false;
                const barClass = barCompleted ? 'bg-slate-600' : 'bg-slate-200';
                return (
                  <React.Fragment key={stage}>
                    <span className={`inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-full px-2 text-[10px] transition ${circleClass}`}>
                      {stageLabels[stage]}
                    </span>
                    {idx < stageMarkers.length - 1 ? <span className={`h-px w-8 rounded-full ${barClass}`} /> : null}
                  </React.Fragment>
                );
              })}
            </div>
          </header>

          {showPenalty && speedState.penalty?.message ? <PenaltyBanner message={speedState.penalty.message} /> : null}

          <div className="relative rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur">
            {mainPanel}
          </div>
        </div>
        <div className="lg:col-span-1">
          <ScoreboardMini
            participants={activeScoreboard}
            highlightUserId={highlightWinnerId}
            statusLabel={scoreboardStatusLabel}
          />
        </div>
      </div>

      {showCountdownOverlay && countdownInfo ? (
        <CountdownOverlay
          seconds={Math.max(countdownInfo.seconds ?? 0, 0)}
          final={countdownInfo.finalCountdown}
          reason={countdownInfo.reason}
          nextRoundIndex={countdownInfo.nextRoundIndex}
        />
      ) : null}

      {showWinnerOverlay && winnerName ? (
        <WinnerSpotlight winnerName={winnerName} score={winnerParticipant?.score} subtitle={winnerSubtitle} />
      ) : null}
    </div>
  );
};

const AutoClose: React.FC<{ onEnded: () => void; delayMs?: number }> = ({ onEnded, delayMs = 5200 }) => {
  useEffect(() => {
    const t = setTimeout(() => {
      try { onEnded(); } catch { /* noop */ }
    }, delayMs);
    return () => clearTimeout(t);
  }, [onEnded, delayMs]);
  return null;
};

const CountdownOverlay: React.FC<{ seconds: number; final?: boolean; reason?: 'lobby' | 'intermission'; nextRoundIndex?: number }> = ({ seconds, final, reason, nextRoundIndex }) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.ceil(Math.max(seconds, 0)) : 0;
  const display = safeSeconds <= 0 ? 'Go!' : safeSeconds.toString();
  const isIntermission = reason === 'intermission';
  const heading = isIntermission ? 'Next Round' : 'Round begins';
  const detail = isIntermission && typeof nextRoundIndex === 'number'
    ? `Round ${nextRoundIndex + 1}`
    : 'Get ready';
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2 text-white">
        <span className="text-xs font-semibold uppercase tracking-[0.6em] text-slate-200">{heading}</span>
        <span
          key={display}
          className={`tabular-nums text-7xl font-bold drop-shadow-lg ${final ? 'animate-bounce' : 'animate-pulse'}`}
        >
          {display}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.4em] text-slate-200">{detail}</span>
      </div>
    </div>
  );
};

const WinnerSpotlight: React.FC<{ winnerName: string; score?: number; subtitle?: string }> = ({ winnerName, score, subtitle }) => (
  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-10">
    <div className="relative flex max-w-md flex-col items-center gap-2 rounded-2xl border border-amber-100 bg-white/95 px-6 py-5 text-center shadow-2xl ring-4 ring-amber-200/60">
      <div className="absolute -top-8 left-1/2 h-14 w-14 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-200 shadow-lg" />
      <span className="relative text-xs font-semibold uppercase tracking-[0.5em] text-amber-500">Winner</span>
      <span className="relative text-2xl font-bold text-slate-900">{winnerName} 🎉</span>
      {typeof score === 'number' ? (
        <span className="relative text-sm text-slate-600">Final score {score.toFixed(2)}</span>
      ) : null}
      <span className="relative text-xs text-slate-500">{subtitle ?? 'Great typing! Waiting for the host to close the session.'}</span>
    </div>
  </div>
);
