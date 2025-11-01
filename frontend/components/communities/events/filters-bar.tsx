"use client";

import clsx from "clsx";
export type EventsScope = "upcoming" | "past" | "all";
export type EventsView = "list" | "calendar";

export interface FiltersBarProps {
  scope: EventsScope;
  view: EventsView;
  onScopeChange: (next: EventsScope) => void;
  onViewChange: (next: EventsView) => void;
}

export function FiltersBar({
  scope,
  view,
  onScopeChange,
  onViewChange,
}: FiltersBarProps) {
  const handleScopeClick = (next: EventsScope) => {
    if (scope !== next) onScopeChange(next);
  };

  const handleViewClick = (next: EventsView) => {
    if (view !== next) onViewChange(next);
  };

  const scopes: Array<{ value: EventsScope; label: string }> = [
    { value: "upcoming", label: "Upcoming" },
    { value: "past", label: "Past" },
    { value: "all", label: "All" },
  ];

  const views: Array<{ value: EventsView; label: string }> = [
    { value: "list", label: "List" },
    { value: "calendar", label: "Calendar" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Scope Filter */}
      <div
        role="group"
        aria-label="Event timeframe"
        className="inline-flex items-center gap-2 rounded-full bg-slate-100 p-1 text-sm font-medium text-slate-600"
      >
        {scopes.map(({ value, label }) => {
          const isActive = scope === value;
          const ariaPressed: "true" | "false" = isActive ? "true" : "false";
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleScopeClick(value)}
              className={clsx(
                "rounded-full px-4 py-1 transition",
                isActive ? "bg-white shadow" : "opacity-70 hover:opacity-100"
              )}
              aria-pressed={ariaPressed}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* View Switcher */}
      <div
        role="group"
        aria-label="Events view"
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 p-1 text-sm font-medium text-slate-600"
      >
        {views.map(({ value, label }) => {
          const isActive = view === value;
          const ariaPressed: "true" | "false" = isActive ? "true" : "false";
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleViewClick(value)}
              className={clsx(
                "rounded-full px-4 py-1 transition",
                isActive ? "bg-slate-900 text-white" : "hover:bg-slate-100"
              )}
              aria-pressed={ariaPressed}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
