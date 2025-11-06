"use client";

import React from "react";

type GoLiveStripProps = {
  enabled: boolean;
  heartbeatSeconds: number;
  radius: number;
  radiusOptions: number[];
  accuracyM?: number | null;
  presenceStatus?: string | null;
  onRadiusChange: (r: number) => void;
  onGoLive: () => void;
};

export default function GoLiveStrip({
  enabled,
  heartbeatSeconds,
  radius,
  radiusOptions,
  accuracyM = null,
  presenceStatus = null,
  onRadiusChange,
  onGoLive,
}: GoLiveStripProps) {
  return (
    <>
      {presenceStatus ? (
        <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{presenceStatus}</p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Radius</span>
          <div className="flex gap-2">
            {radiusOptions.map((option) => (
              <button
                key={option}
                className={`rounded px-3 py-1 text-sm ${
                  option === radius ? "bg-slate-900 text-white" : "bg-white text-slate-700 shadow"
                }`}
                onClick={() => onRadiusChange(option)}
              >
                {option}m
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onGoLive}
          disabled={!enabled}
          className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
            enabled ? "bg-midnight text-white hover:bg-navy" : "cursor-not-allowed bg-slate-200 text-slate-500"
          }`}
          aria-label={enabled ? `Go live now. Heartbeats every ${heartbeatSeconds}s` : "Go live disabled"}
        >
          Go live now
        </button>
      </section>

      {accuracyM != null && radius <= accuracyM ? (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Tip: your current location accuracy is about ~{accuracyM}m. At {radius}m, results may be empty. Try 50m or 100m.
        </p>
      ) : null}
    </>
  );
}
