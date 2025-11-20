"use client";

import { useCallback, useMemo } from "react";

import { getSelf } from "@/app/features/activities/api/client";
import { useFriendIdentities } from "@/hooks/social/use-friend-identities";
import { useRockPaperScissorsSession, type RockPaperScissorsState, type RpsChoice } from "../hooks/useRockPaperScissorsSession";

type Props = {
  sessionId?: string;
};

const moveLabels: Record<"rock" | "paper" | "scissors", string> = {
  rock: "🪨 Rock",
  paper: "📄 Paper",
  scissors: "✂️ Scissors",
};

type PresenceCard = RockPaperScissorsState["presence"][number] & {
  label: string;
  subtitle?: string | null;
};

function PresenceList({ entries }: { entries: PresenceCard[] }) {
  if (!entries || entries.length === 0) {
    return <p className="text-xs text-slate-500">Waiting for players to join.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
      {entries.map((entry) => (
        <li key={entry.userId} className="flex items-center justify-between px-3 py-2 text-sm">
          <div>
            <p className="font-semibold text-slate-800">{entry.label}</p>
            <p className="text-[11px] text-slate-500">
              {entry.subtitle ? entry.subtitle : entry.joined ? "Connected" : "Offline"}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              entry.ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {entry.ready ? "Ready" : "Not ready"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RockPaperScissorsPanel({ sessionId }: Props) {
  const { state, readyUp, unready, submitMove } = useRockPaperScissorsSession({ sessionId });
  const { map: friendIdentities, authUser } = useFriendIdentities();
  const selfId = useMemo(() => getSelf(), []);
  const selfPresence = state.presence.find((entry) => entry.userId === selfId);
  const isReady = Boolean(selfPresence?.ready);
  const disableMoves = state.phase !== "running" || Boolean(state.submittedMove);

  const formatHandle = useCallback((value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  }, []);

  const resolveName = useCallback(
    (userId: string) => {
      if (authUser?.userId === userId) {
        const preferred = authUser.displayName?.trim();
        return preferred && preferred.length > 0 ? preferred : "You";
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
    [authUser?.displayName, authUser?.userId, friendIdentities, formatHandle],
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

  const presenceCards = useMemo<PresenceCard[]>(
    () =>
      state.presence.map((entry) => ({
        ...entry,
        label: resolveName(entry.userId),
        subtitle: resolveSubtitle(entry.userId),
      })),
    [resolveName, resolveSubtitle, state.presence],
  );

  const scoreboardCards = useMemo(
    () =>
      state.scoreboard.map((entry) => ({
        ...entry,
        label: resolveName(entry.userId),
      })),
    [resolveName, state.scoreboard],
  );

  const winnerLabel = useMemo(() => (state.winnerUserId ? resolveName(state.winnerUserId) : null), [resolveName, state.winnerUserId]);
  const lastRoundWinnerLabel = useMemo(() => (state.lastRoundWinner ? resolveName(state.lastRoundWinner) : null), [resolveName, state.lastRoundWinner]);

  if (!sessionId) {
    return <p className="text-sm text-slate-600">Start or join a session to play.</p>;
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Session</p>
          <p className="text-xs text-slate-500 break-all">{sessionId}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Phase</p>
          <p className="text-sm font-semibold text-slate-900">{state.phase}</p>
        </div>
      </header>

      {state.phase === "running" && state.countdown ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Round in progress. Time remaining:{" "}
          {Math.max(0, Math.floor((state.countdown.endsAt - Date.now()) / 1000))}s
        </div>
      ) : null}

      {state.phase === "ended" && state.winnerUserId ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Winner: {winnerLabel ?? state.winnerUserId}
        </div>
      ) : null}

      {state.phase === "error" && state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Lobby</p>
            <button
              onClick={isReady ? unready : readyUp}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isReady ? "bg-slate-200 text-slate-700" : "bg-sky-600 text-white"
              }`}
            >
              {isReady ? "Unready" : "Ready up"}
            </button>
          </div>
          <PresenceList entries={presenceCards} />
          {state.countdown && state.phase === "countdown" ? (
            <p className="text-xs text-amber-700">Countdown started. Get ready!</p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Scoreboard</p>
          {scoreboardCards.length === 0 ? (
            <p className="text-xs text-slate-500">No scores yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {scoreboardCards.map((entry) => (
                <li key={entry.userId} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-semibold text-slate-800">{entry.label}</span>
                  <span className="text-slate-600">{entry.score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-slate-800">Play</p>
        {state.phase !== "running" ? (
          <p className="text-xs text-slate-500">Wait for both players to ready up to start the next round.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(moveLabels) as Array<RpsChoice>).map((move) => (
              <button
                key={move}
                disabled={disableMoves}
                onClick={() => submitMove(move)}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold shadow ${
                  disableMoves ? "cursor-not-allowed bg-slate-200 text-slate-500" : "bg-indigo-600 text-white hover:bg-indigo-500"
                }`}
              >
                {moveLabels[move]}
              </button>
            ))}
          </div>
        )}
        {state.submittedMove ? (
          <p className="text-xs text-slate-600">Move submitted: {state.submittedMove}. Waiting for opponent.</p>
        ) : null}
        {state.lastRoundWinner ? (
          <p className="text-xs text-emerald-700">
            Last round winner: <span className="font-semibold">{lastRoundWinnerLabel ?? state.lastRoundWinner}</span>{" "}
            {state.lastRoundReason ? `(${state.lastRoundReason})` : ""}
          </p>
        ) : state.lastRoundReason ? (
          <p className="text-xs text-slate-600">Last round: {state.lastRoundReason}</p>
        ) : null}
      </section>
    </div>
  );
}
