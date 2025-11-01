import { useMemo, useState } from "react";

import type { EventSummary } from "@/lib/communities";
import { resolvedUserTimezone, toUserTz } from "@/utils/datetime";

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function inclusiveDaysBetween(start: Date, end: Date, callback: (day: Date) => void, limit = 31) {
  const cursor = new Date(start);
  let count = 0;
  while (cursor <= end && count < limit) {
    callback(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    count += 1;
  }
}

function computeGridStart(date: Date) {
  const first = startOfMonth(date);
  const dayOfWeek = first.getDay();
  return addDays(first, -dayOfWeek);
}

export type CalendarDay = {
  date: Date;
  iso: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  events: EventSummary[];
};

export function useCalendarMonth(events: EventSummary[], options?: { month?: Date; timezone?: string }) {
  const timezone = options?.timezone ?? resolvedUserTimezone();
  const initialMonth = options?.month ?? new Date();
  const [month, setMonth] = useState(startOfMonth(initialMonth));
  const [focusedIso, setFocusedIso] = useState(() => toIsoDate(new Date()));

  const eventIndex = useMemo(() => {
    const index = new Map<string, EventSummary[]>();
    events.forEach((event) => {
      const start = toUserTz(event.start_at, timezone);
      const end = toUserTz(event.end_at, timezone);
      inclusiveDaysBetween(start, end, (day) => {
        const iso = toIsoDate(day);
        const bucket = index.get(iso) ?? [];
        if (!bucket.find((item) => item.id === event.id)) {
          bucket.push(event);
          index.set(iso, bucket);
        }
      });
    });
    return index;
  }, [events, timezone]);

  const days = useMemo<CalendarDay[]>(() => {
    const todayIso = toIsoDate(new Date());
    const start = computeGridStart(month);
    const grid: CalendarDay[] = [];
    for (let cell = 0; cell < 42; cell += 1) {
      const current = addDays(start, cell);
      const iso = toIsoDate(current);
      grid.push({
        date: current,
        iso,
        inCurrentMonth: current.getMonth() === month.getMonth(),
        isToday: iso === todayIso,
        events: eventIndex.get(iso) ?? [],
      });
    }
    return grid;
  }, [eventIndex, month]);

  return {
    month,
    days,
    timezone,
    focusedIso,
    setFocusedIso,
    goToNextMonth: () => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)),
    goToPreviousMonth: () => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)),
    goToToday: () => setMonth(startOfMonth(new Date())),
  };
}
