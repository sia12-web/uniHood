"use client";

import React from "react";

type ActivityLobbySummaryProps = {
  countdownSeconds?: number | null;
  lobbyReady?: boolean;
  leaderLabel?: string;
  leaderScore?: number | string;
  hostLabel?: string;
  joinedCount?: number;
  readyCount?: number;
  totalParticipants?: number;
};

export const ActivityLobbySummary: React.FC<ActivityLobbySummaryProps> = ({
  countdownSeconds,
  lobbyReady,
  leaderLabel,
  leaderScore,
  hostLabel,
  joinedCount,
  readyCount,
  totalParticipants,
}) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Lobby</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Ready up</p>
          <p className="text-xs text-slate-600">Everyone joins and readies up. Once all players are ready the host can arm a 10 second countdown.</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Start 10s countdown</p>
          <p className="text-xs text-slate-600">{lobbyReady ? "Countdown armed." : "Waiting for all players to ready."}</p>
          {typeof countdownSeconds === "number" && countdownSeconds > 0 ? (
            <p className="text-xs font-semibold text-emerald-700">Starting in {countdownSeconds}s</p>
          ) : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Score lead</p>
          {leaderLabel ? (
            <p className="text-xs text-slate-700">
              {leaderLabel} ({leaderScore ?? 0})
            </p>
          ) : (
            <p className="text-xs text-slate-500">No scores yet.</p>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs text-slate-700">
        <p>
          Host: <span className="font-semibold">{hostLabel ?? "—"}</span>
        </p>
        <p>
          Joined: <span className="font-semibold">{joinedCount ?? 0}/{totalParticipants ?? 0}</span>
        </p>
        <p>
          Ready: <span className="font-semibold">{readyCount ?? 0}/{totalParticipants ?? 0}</span>
        </p>
      </div>
    </div>
  );
};
