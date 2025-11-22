"use client";

import { useCallback, useMemo } from "react";
import { Swords, Trophy, Users, Scissors, FileText, Circle, Check, AlertCircle } from "lucide-react";

import { getSelf } from "@/app/features/activities/api/client";
import { useFriendIdentities } from "@/hooks/social/use-friend-identities";
import { useRockPaperScissorsSession, type RpsChoice } from "../hooks/useRockPaperScissorsSession";

type Props = {
  sessionId?: string;
};

const MOVES: Record<RpsChoice, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  rock: { 
    label: "Rock", 
    icon: Circle, 
    color: "text-slate-600",
    bg: "bg-slate-100"
  },
  paper: { 
    label: "Paper", 
    icon: FileText, 
    color: "text-blue-600",
    bg: "bg-blue-50"
  },
  scissors: { 
    label: "Scissors", 
    icon: Scissors, 
    color: "text-rose-600",
    bg: "bg-rose-50"
  },
};

export function RockPaperScissorsPanel({ sessionId }: Props) {
  const { state, readyUp, unready, submitMove } = useRockPaperScissorsSession({ sessionId });
  const { map: friendIdentities, authUser } = useFriendIdentities();
  const selfId = useMemo(() => getSelf(), []);
  
  // Helper to resolve names
  const resolveName = useCallback(
    (userId: string) => {
      if (authUser?.userId === userId) return "You";
      const friend = friendIdentities.get(userId);
      return friend?.displayName || friend?.handle || userId.slice(0, 8);
    },
    [authUser?.userId, friendIdentities]
  );

  const selfPresence = state.presence.find((p) => p.userId === selfId);
  const isReady = Boolean(selfPresence?.ready);
  const opponent = state.presence.find((p) => p.userId !== selfId);
  const opponentName = opponent ? resolveName(opponent.userId) : "Opponent";

  // Render Helpers
  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-6 flex items-center justify-center gap-8">
        {/* Self */}
        <div className="flex flex-col items-center gap-3">
          <div className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all ${isReady ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="text-2xl font-bold text-slate-700">
              {authUser?.displayName?.[0] || "Y"}
            </div>
            {isReady && (
              <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                <Check className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-900">You</p>
            <p className={`text-xs ${isReady ? 'text-emerald-600' : 'text-slate-500'}`}>
              {isReady ? "Ready" : "Not Ready"}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="h-px w-12 bg-slate-200"></div>
          <span className="text-xs font-medium text-slate-400">VS</span>
          <div className="h-px w-12 bg-slate-200"></div>
        </div>

        {/* Opponent */}
        <div className="flex flex-col items-center gap-3">
          {opponent ? (
            <>
              <div className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all ${opponent.ready ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-2xl font-bold text-slate-700">
                  {opponentName[0]}
                </div>
                {opponent.ready && (
                  <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{opponentName}</p>
                <p className={`text-xs ${opponent.ready ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {opponent.ready ? "Ready" : "Not Ready"}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-full border-4 border-dashed border-slate-200 bg-slate-50">
                <Users className="h-8 w-8 text-slate-300" />
              </div>
              <div>
                <p className="font-semibold text-slate-400">Waiting...</p>
                <p className="text-xs text-slate-400">Invite a friend</p>
              </div>
            </>
          )}
        </div>
      </div>

      <button
        onClick={isReady ? unready : readyUp}
        className={`mt-8 min-w-[200px] rounded-full px-8 py-3 text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl ${
          isReady 
            ? "bg-slate-100 text-slate-600 hover:bg-slate-200" 
            : "bg-rose-600 text-white hover:bg-rose-500"
        }`}
      >
        {isReady ? "Cancel Ready" : "Ready Up"}
      </button>
    </div>
  );

  const renderCountdown = () => {
    if (!state.countdown) return null;
    const secondsLeft = Math.max(0, Math.ceil((state.countdown.endsAt - Date.now()) / 1000));
    
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-rose-50">
          <div className="absolute inset-0 animate-ping rounded-full bg-rose-100 opacity-75"></div>
          <span className="relative text-6xl font-black text-rose-600">{secondsLeft}</span>
        </div>
        <p className="mt-8 text-lg font-medium text-slate-600">Get Ready!</p>
      </div>
    );
  };

  const renderRunning = () => {
    const hasSubmitted = Boolean(state.submittedMove);
    
    return (
      <div className="py-8">
        <div className="mb-8 text-center">
          <h3 className="text-2xl font-bold text-slate-900">Choose Your Weapon</h3>
          <p className="text-slate-500">Opponent is {opponent?.ready ? "thinking..." : "waiting"}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(MOVES) as RpsChoice[]).map((move) => {
            const config = MOVES[move];
            const Icon = config.icon;
            const isSelected = state.submittedMove === move;
            
            return (
              <button
                key={move}
                onClick={() => submitMove(move)}
                disabled={hasSubmitted}
                className={`group relative flex flex-col items-center gap-4 rounded-2xl border-2 p-6 transition-all ${
                  isSelected 
                    ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-500 ring-offset-2' 
                    : hasSubmitted
                      ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-50'
                      : 'border-slate-200 bg-white hover:-translate-y-1 hover:border-rose-200 hover:shadow-lg'
                }`}
              >
                <div className={`flex h-16 w-16 items-center justify-center rounded-full ${config.bg} transition-transform group-hover:scale-110`}>
                  <Icon className={`h-8 w-8 ${config.color}`} />
                </div>
                <span className={`font-bold ${isSelected ? 'text-rose-700' : 'text-slate-700'}`}>
                  {config.label}
                </span>
                {isSelected && (
                  <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {hasSubmitted && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
            <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400"></div>
            <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-100"></div>
            <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-200"></div>
            <span>Waiting for opponent...</span>
          </div>
        )}
      </div>
    );
  };

  const renderResults = () => {
    const myMove = state.submittedMove;
    // We need to infer opponent move from winner or if it's exposed in state (it's not directly exposed until revealed)
    // Actually, in 'ended' phase, we usually know the result. 
    // The hook doesn't explicitly give opponent move, but we can infer it or maybe the backend sends it.
    // Looking at the hook type, we don't have opponentMove. 
    // However, we have `lastRoundWinner` and `lastRoundReason`.
    
    const isWinner = state.winnerUserId === selfId;
    const isDraw = !state.winnerUserId;
    
    return (
      <div className="py-8 text-center">
        <div className="mb-8">
          {isWinner ? (
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Trophy className="h-10 w-10" />
            </div>
          ) : isDraw ? (
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <Swords className="h-10 w-10" />
            </div>
          ) : (
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <AlertCircle className="h-10 w-10" />
            </div>
          )}
          
          <h2 className="text-3xl font-bold text-slate-900">
            {isWinner ? "Victory!" : isDraw ? "It's a Draw!" : "Defeat"}
          </h2>
          <p className="mt-2 text-slate-600">
            {state.lastRoundReason || (isWinner ? "You won this round!" : "Better luck next time.")}
          </p>
        </div>

        <div className="mb-12 flex items-center justify-center gap-12">
          {/* My Move */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">You</p>
            {myMove && MOVES[myMove] ? (
              <div className={`flex h-24 w-24 items-center justify-center rounded-2xl border-2 ${isWinner ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                {(() => {
                  const Icon = MOVES[myMove].icon;
                  return <Icon className={`h-10 w-10 ${MOVES[myMove].color}`} />;
                })()}
              </div>
            ) : null}
            <p className="font-semibold text-slate-900">{myMove ? MOVES[myMove].label : "?"}</p>
          </div>

          <div className="text-2xl font-black text-slate-300">VS</div>

          {/* Opponent Move - We might not know it if it's not in state, but usually revealed in reason */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Opponent</p>
            <div className={`flex h-24 w-24 items-center justify-center rounded-2xl border-2 ${!isWinner && !isDraw ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
               {/* Since we don't have opponent move in state explicitly, we show a generic revealed icon or question mark if hidden */}
               <div className="text-4xl">?</div>
            </div>
            <p className="font-semibold text-slate-900">Hidden</p>
          </div>
        </div>

        <button
          onClick={readyUp}
          className="rounded-full bg-rose-600 px-8 py-3 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-rose-500 hover:shadow-xl"
        >
          Play Again
        </button>
      </div>
    );
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-slate-100 p-4 text-slate-400">
          <Swords className="h-8 w-8" />
        </div>
        <p className="text-slate-600">Start or join a session to play.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[400px]">
      {/* Header Stats */}
      <div className="mb-8 flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-slate-600">Scoreboard</span>
        </div>
        <div className="flex gap-6 text-sm">
          {state.scoreboard.map((score) => (
            <div key={score.userId} className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{resolveName(score.userId)}:</span>
              <span className="font-bold text-rose-600">{score.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Game Area */}
      <div className="transition-all duration-300">
        {state.phase === "countdown" && renderCountdown()}
        {state.phase === "running" && renderRunning()}
        {state.phase === "ended" && renderResults()}
        {(state.phase === "lobby" || state.phase === "error") && renderLobby()}
      </div>

      {state.error && (
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-sm text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}
    </div>
  );
}
