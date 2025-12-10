"use client";

import { useCallback, useMemo, useEffect, useState } from "react";
import { Swords, Trophy, Users, Scissors, FileText, Circle, Check, AlertCircle, LogOut, Minus } from "lucide-react";

import { getSelf } from "@/app/features/activities/api/client";
import { useFriendIdentities } from "@/hooks/social/use-friend-identities";
import { useRockPaperScissorsSession, type RpsChoice } from "../hooks/useRockPaperScissorsSession";
import { MyPointsBadge } from "./MyPointsBadge";

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
  const { state, readyUp, unready, submitMove, leave } = useRockPaperScissorsSession({ sessionId });
  const { map: friendIdentities, authUser } = useFriendIdentities();
  const selfId = useMemo(() => getSelf(), []);
  
  // Track when to show round result (after both players move, before next round)
  const [showingRoundResult, setShowingRoundResult] = useState(false);
  const [lastSeenMoves, setLastSeenMoves] = useState<string | null>(null);
  
  // When lastRoundMoves updates (round ends), show the result
  useEffect(() => {
    if (state.lastRoundMoves && state.lastRoundMoves.length >= 2) {
      // Create a unique key for this set of moves
      const movesKey = JSON.stringify(state.lastRoundMoves);
      // Only show if this is a new round result
      if (lastSeenMoves !== movesKey) {
        setShowingRoundResult(true);
        setLastSeenMoves(movesKey);
        // Auto-hide after 2.5 seconds (before next round countdown)
        const timer = setTimeout(() => {
          setShowingRoundResult(false);
        }, 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [state.lastRoundMoves, lastSeenMoves]);

  // Reset when moves are cleared (new round started)
  useEffect(() => {
    if (!state.lastRoundMoves) {
      setShowingRoundResult(false);
    }
  }, [state.lastRoundMoves]);
  
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
      <div className="mb-2 text-xs text-slate-400 uppercase tracking-wider font-bold">Best of 5 • First to 3 Wins</div>
      <div className="mb-6">
        <MyPointsBadge />
      </div>
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

      <button
        onClick={leave}
        className="mt-4 flex items-center gap-2 rounded-full bg-slate-100 px-6 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-200"
      >
        <LogOut className="h-4 w-4" />
        Leave Session
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

  const renderRoundResult = () => {
    if (!state.lastRoundMoves || state.lastRoundMoves.length < 2) return null;
    
    const myMoveData = state.lastRoundMoves.find(m => m.userId === selfId);
    const opponentMoveData = state.lastRoundMoves.find(m => m.userId !== selfId);
    const myMove = myMoveData?.move as RpsChoice | undefined;
    const opponentMove = opponentMoveData?.move as RpsChoice | undefined;
    
    const iWonRound = state.lastRoundWinner === selfId;
    const opponentWonRound = state.lastRoundWinner && state.lastRoundWinner !== selfId;
    const isDraw = state.lastRoundReason === "draw" || !state.lastRoundWinner;
    
    // Get round wins from scoreboard (scoreboard shows round wins during game)
    const myRoundWins = state.scoreboard.find(s => s.userId === selfId)?.score ?? 0;
    const opponentRoundWins = state.scoreboard.find(s => s.userId !== selfId)?.score ?? 0;
    
    // The round that just finished (currentRound is 0-based and incremented after round ends,
    // so the round we're showing results for is currentRound, display as +1 for human-readable)
    const completedRound = state.currentRound ?? 0;
    
    return (
      <div className="py-8 animate-in fade-in duration-300">
        <div className="mb-6 text-center">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Round {completedRound} Result</span>
          <h3 className={`text-2xl font-bold mt-2 ${iWonRound ? 'text-emerald-600' : opponentWonRound ? 'text-rose-600' : 'text-slate-600'}`}>
            {iWonRound ? "You Won This Round! 🎉" : opponentWonRound ? `${opponentName} Won This Round` : "It's a Draw!"}
          </h3>
        </div>

        {/* Show both moves */}
        <div className="flex items-center justify-center gap-8 mb-6">
          {/* My Move */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">You</p>
            {myMove && MOVES[myMove] ? (
              <div className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 transition-all ${iWonRound ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                {(() => {
                  const Icon = MOVES[myMove].icon;
                  return <Icon className={`h-8 w-8 ${MOVES[myMove].color}`} />;
                })()}
              </div>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white">
                <span className="text-2xl">?</span>
              </div>
            )}
            <p className="font-semibold text-slate-900">{myMove ? MOVES[myMove].label : "?"}</p>
          </div>

          <div className="text-xl font-black text-slate-300">VS</div>

          {/* Opponent Move */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{opponentName}</p>
            {opponentMove && MOVES[opponentMove] ? (
              <div className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 transition-all ${opponentWonRound ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                {(() => {
                  const Icon = MOVES[opponentMove].icon;
                  return <Icon className={`h-8 w-8 ${MOVES[opponentMove].color}`} />;
                })()}
              </div>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white">
                <span className="text-2xl">?</span>
              </div>
            )}
            <p className="font-semibold text-slate-900">{opponentMove ? MOVES[opponentMove].label : "?"}</p>
          </div>
        </div>

        {/* Score display */}
        <div className="flex items-center justify-center gap-4 text-sm">
          <div className={`px-4 py-2 rounded-full ${myRoundWins > opponentRoundWins ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            <span className="font-bold">You: {myRoundWins}</span>
          </div>
          <Minus className="h-4 w-4 text-slate-300" />
          <div className={`px-4 py-2 rounded-full ${opponentRoundWins > myRoundWins ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            <span className="font-bold">{opponentName}: {opponentRoundWins}</span>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-500 animate-pulse">Next round starting soon...</p>
      </div>
    );
  };

  const renderRunning = () => {
    const hasSubmitted = Boolean(state.submittedMove);
    const currentRound = state.currentRound ?? 0;
    
    // Show round result if we just finished a round
    if (showingRoundResult && state.lastRoundMoves && state.lastRoundMoves.length >= 2) {
      return renderRoundResult();
    }
    
    return (
      <div className="py-8">
        <div className="mb-8 text-center">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Best of 5 • Round {currentRound + 1} of 5</span>
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
    const opponentLeft = state.leaveReason === "opponent_left";
    
    return (
      <div className="py-8 text-center">
        {opponentLeft && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-lg bg-amber-50 p-4 text-amber-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">Your opponent left the game. You win!</span>
          </div>
        )}

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
            {isWinner ? "You won the game!" : isDraw ? "The match ended in a tie." : "Better luck next time."}
          </p>
          {state.scoreboard.length >= 2 && (
            <div className="mt-4 flex justify-center gap-4 text-slate-600">
              <span className="font-semibold">You: {state.scoreboard.find(s => s.userId === selfId)?.score || 0}</span>
              <span>—</span>
              <span className="font-semibold">{opponentName}: {state.scoreboard.find(s => s.userId !== selfId)?.score || 0}</span>
            </div>
          )}
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
          {state.scoreboard.some(s => s.score >= 2) ? "New Match" : "Next Round"}
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
