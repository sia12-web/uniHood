"use client";

import { useCallback, useMemo } from "react";
import { Users, LogOut, Check, Trophy, AlertCircle } from "lucide-react";

import { getSelf } from "@/app/features/activities/api/client";
import { useFriendIdentities } from "@/hooks/social/use-friend-identities";
import { useRockPaperScissorsSession } from "../hooks/useRockPaperScissorsSession";
import { MyPointsBadge } from "./MyPointsBadge";
import { AnimeDuelArena } from "./AnimeDuelArena";

type Props = {
  sessionId?: string;
};

export function RockPaperScissorsPanel({ sessionId }: Props) {
  const { state, readyUp, unready, submitMove, leave, restart } = useRockPaperScissorsSession({ sessionId });
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
        className={`mt-8 min-w-[200px] rounded-full px-8 py-3 text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl ${isReady
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

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-slate-600">Connecting...</p>
      </div>
    );
  }

  // Determine which view to show
  const showArena = state.phase === "countdown" || state.phase === "running" || state.phase === "ended";

  return (
    <div className="relative min-h-[400px]">
      {/* Header Stats - Always show scoreboard if in arena */}
      {showArena && (
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-slate-600">Scoreboard (Wins)</span>
          </div>
          <div className="flex gap-6 text-sm">
            {state.scoreboard.map((score) => {
              const roundWins = score.score >= 100 ? Math.floor(score.score / 100) : score.score;
              return (
                <div key={score.userId} className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{resolveName(score.userId)}:</span>
                  <span className="font-bold text-rose-600">{roundWins}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Game Area */}
      <div className="transition-all duration-300">
        {showArena ? (
          <AnimeDuelArena
            state={state}
            selfUserId={selfId}
            opponentUserId={opponent?.userId}
            submitMove={submitMove}
            onRestart={restart}
          />
        ) : (
          renderLobby()
        )}
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
