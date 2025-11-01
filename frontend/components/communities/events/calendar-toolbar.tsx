"use client";

import { format } from "date-fns";

export type CalendarToolbarProps = {
  month: Date;
  onPrevious(): void;
  onNext(): void;
  onToday(): void;
};

export function CalendarToolbar({ month, onNext, onPrevious, onToday }: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-lg font-semibold text-slate-900">{format(month, "MMMM yyyy")}</div>
      <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
        <button
          type="button"
          onClick={onPrevious}
          className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100"
          aria-label="Previous month"
        >
          ←
        </button>
        <button
          type="button"
          onClick={onToday}
          className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100"
          aria-label="Next month"
        >
          →
        </button>
      </div>
    </div>
  );
}
