"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import type { EventSummary } from "@/lib/communities";
import { useCalendarMonth } from "@/hooks/communities/use-calendar";

import { CalendarToolbar } from "./calendar-toolbar";
import { DayDrawer } from "./day-drawer";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EventsCalendar({ events }: { events: EventSummary[] }) {
  const calendar = useCalendarMonth(events);
  const [drawerIso, setDrawerIso] = useState<string | null>(null);

  const dayIndex = useMemo(() => new Map(calendar.days.map((day, index) => [day.iso, index])), [calendar.days]);

  const selectedDay = calendar.days.find((day) => day.iso === drawerIso) ?? null;

  function handleMove(offset: number) {
    const index = dayIndex.get(calendar.focusedIso);
    if (index === undefined) {
      return;
    }
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= calendar.days.length) {
      return;
    }
    const nextDay = calendar.days[nextIndex];
    calendar.setFocusedIso(nextDay.iso);
  }

  return (
    <div className="space-y-4">
      <CalendarToolbar
        month={calendar.month}
        onNext={calendar.goToNextMonth}
        onPrevious={calendar.goToPreviousMonth}
        onToday={calendar.goToToday}
      />
      <div role="grid" aria-label="Events calendar" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div role="row" className="grid grid-cols-7 gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} role="columnheader" className="px-2 py-1 text-center">
              {label}
            </div>
          ))}
        </div>
        <div role="rowgroup" className="mt-2 grid grid-cols-7 gap-1">
          {calendar.days.map((day) => (
            <button
              key={day.iso}
              type="button"
              role="gridcell"
              aria-selected={drawerIso === day.iso}
              data-focused={calendar.focusedIso === day.iso ? "true" : undefined}
              onClick={() => setDrawerIso(day.iso)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  handleMove(1);
                }
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  handleMove(-1);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  handleMove(7);
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  handleMove(-7);
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setDrawerIso(day.iso);
                }
              }}
              onFocus={() => calendar.setFocusedIso(day.iso)}
              className={clsx(
                "flex min-h-[92px] flex-col rounded-xl border p-2 text-left transition focus:outline-none focus:ring-2 focus:ring-slate-400",
                day.inCurrentMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 text-slate-400",
                day.isToday ? "border-slate-900" : "",
                day.events.length ? "hover:border-slate-300" : "",
              )}
            >
              <span className="text-sm font-semibold">{day.date.getDate()}</span>
              <span className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-slate-500">
                {day.events.slice(0, 2).map((event) => (
                  <span
                    key={event.id}
                    className="inline-flex truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                    title={event.title}
                  >
                    {event.title}
                  </span>
                ))}
                {day.events.length > 2 ? (
                  <span className="text-[11px] font-semibold text-slate-400">+{day.events.length - 2}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
      <DayDrawer
        open={Boolean(drawerIso)}
        onClose={() => setDrawerIso(null)}
        date={selectedDay?.date ?? null}
        events={selectedDay?.events ?? []}
      />
    </div>
  );
}
