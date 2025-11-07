"use client";

import React from "react";

type GoLiveStripProps = {
  enabled: boolean;
  heartbeatSeconds: number;
  radius: number;
  // If provided, render preset buttons; otherwise, show a range slider when sliderMin/Max exist
  radiusOptions?: number[];
  // Slider config (optional)
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  presenceStatus?: string | null;
  onRadiusChange: (r: number) => void;
  // Legacy one-shot Go Live handler
  onGoLive?: () => void;
  // Optional toggle live mode
  isLive?: boolean;
  onToggleLive?: () => void;
};

export default function GoLiveStrip({
  enabled,
  heartbeatSeconds,
  radius,
  radiusOptions = [],
  sliderMin,
  sliderMax,
  sliderStep = 10,
  presenceStatus = null,
  onRadiusChange,
  onGoLive,
  isLive,
  onToggleLive,
}: GoLiveStripProps) {
  return (
    <>
      {presenceStatus ? (
        <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{presenceStatus}</p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Radius</span>
          {radiusOptions.length > 0 ? (
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
          ) : sliderMin != null && sliderMax != null ? (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={sliderStep}
                value={radius}
                onChange={(e) => onRadiusChange(Number(e.target.value))}
                aria-label="Discovery radius"
                className="h-1.5 w-40 cursor-pointer appearance-none rounded bg-slate-200 accent-slate-900"
              />
              <span className="text-sm font-medium text-slate-800">{radius}m</span>
            </div>
          ) : null}
        </div>

        {onToggleLive ? (
          <button
            type="button"
            onClick={onToggleLive}
            disabled={!enabled}
            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
              !enabled
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : isLive
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-slate-900 text-white hover:bg-navy"
            }`}
            aria-label={!enabled ? "Go live disabled" : isLive ? "Live on. Click to turn off" : `Go live. Heartbeats every ${heartbeatSeconds}s`}
          >
            {isLive ? "Live" : "Go live"}
          </button>
        ) : (
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
        )}
      </section>

      {/* Accuracy tip removed per request */}
    </>
  );
}
