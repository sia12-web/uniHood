"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import { TagSelector } from "@/components/communities/group/tag-selector";
import type { NormalizedSearchParams, SearchScope } from "@/utils/search";

export type CampusOption = {
  id: string;
  name: string;
};

export type TimeRangePreset = "any" | "next7" | "next30" | "custom";

export type FiltersBarProps = {
  scope: SearchScope;
  params: NormalizedSearchParams;
  campuses: CampusOption[];
  onCampusChange(next: string | null): void;
  onTimeChange(range: { preset: TimeRangePreset; from?: string | null; to?: string | null }): void;
  onTagsChange(tags: string[]): void;
  onReset(): void;
};

function computePreset(params: NormalizedSearchParams): TimeRangePreset {
  if (!params.time_from && !params.time_to) {
    return "any";
  }
  const now = Date.now();
  const next7 = now + 7 * 24 * 60 * 60 * 1000;
  const next30 = now + 30 * 24 * 60 * 60 * 1000;
  const from = params.time_from ? new Date(params.time_from).getTime() : null;
  const to = params.time_to ? new Date(params.time_to).getTime() : null;
  if (from && !Number.isNaN(from) && from >= now && from <= next7 && (!to || to <= next7)) {
    return "next7";
  }
  if (from && !Number.isNaN(from) && from >= now && from <= next30 && (!to || to <= next30)) {
    return "next30";
  }
  return "custom";
}

function toInputValue(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().split("T")[0];
}

function toIsoDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

const PRESET_OPTIONS: Array<{ value: TimeRangePreset; label: string; description: string }> = [
  { value: "any", label: "Any time", description: "Show everything" },
  { value: "next7", label: "Next 7 days", description: "Upcoming week" },
  { value: "next30", label: "Next 30 days", description: "Upcoming month" },
  { value: "custom", label: "Custom", description: "Pick a range" },
];

export function FiltersBar({ scope, params, campuses, onCampusChange, onTimeChange, onTagsChange, onReset }: FiltersBarProps) {
  const preset = useMemo(() => computePreset(params), [params]);
  const [customFrom, setCustomFrom] = useState(() => toInputValue(params.time_from));
  const [customTo, setCustomTo] = useState(() => toInputValue(params.time_to));

  useEffect(() => {
    setCustomFrom(toInputValue(params.time_from));
    setCustomTo(toInputValue(params.time_to));
  }, [params.time_from, params.time_to]);

  const handlePresetChange = (next: TimeRangePreset) => {
    if (next === "any") {
      onTimeChange({ preset: "any", from: null, to: null });
      return;
    }
    if (next === "next7" || next === "next30") {
      const now = new Date();
      const from = now.toISOString();
      const cap = new Date(now);
      cap.setDate(now.getDate() + (next === "next7" ? 7 : 30));
      onTimeChange({ preset: next, from, to: cap.toISOString() });
      return;
    }
    onTimeChange({ preset: "custom", from: params.time_from ?? null, to: params.time_to ?? null });
  };

  const handleCustomChange = (type: "from" | "to", value: string) => {
    if (type === "from") {
      setCustomFrom(value);
    } else {
      setCustomTo(value);
    }
    const nextFrom = type === "from" ? toIsoDate(value) : toIsoDate(customFrom);
    const nextTo = type === "to" ? toIsoDate(value) : toIsoDate(customTo);
    onTimeChange({ preset: "custom", from: nextFrom, to: nextTo });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Filters</h2>
          <p className="text-xs text-slate-500">Refine with campus, time, and tags.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCustomFrom("");
            setCustomTo("");
            onReset();
          }}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
        >
          Reset
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Campus
          <select
            value={params.campus_id ?? ""}
            onChange={(event) => onCampusChange(event.target.value || null)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
          >
            <option value="">All campuses</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Time</span>
          <div className="flex flex-wrap gap-2">
            {PRESET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePresetChange(option.value)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  preset === option.value
                    ? "border-midnight bg-midnight text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{PRESET_OPTIONS.find((option) => option.value === preset)?.description}</p>
          {preset === "custom" ? (
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">
              <label className="grid gap-1">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => handleCustomChange("from", event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
                />
              </label>
              <label className="grid gap-1">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => handleCustomChange("to", event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {scope === "posts" ? (
        <div className="space-y-3">
          <TagSelector value={params.tags} onChange={onTagsChange} />
        </div>
      ) : null}
    </section>
  );
}
