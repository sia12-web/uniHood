"use client";

import { useEffect } from "react";
import clsx from "clsx";

import { format } from "date-fns";

import type { EventSummary } from "@/lib/communities";
import { EventCard } from "./event-card";

export type DayDrawerProps = {
  open: boolean;
  onClose(): void;
  date: Date | null;
  events: EventSummary[];
};

export function DayDrawer({ open, onClose, date, events }: DayDrawerProps) {
  useEffect(() => {
    function listener(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    if (open) {
      window.addEventListener("keydown", listener);
      return () => window.removeEventListener("keydown", listener);
    }
    return undefined;
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {date ? format(date, "EEEE, MMMM d") : "Events"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className={clsx("mt-4 space-y-3 overflow-y-auto", events.length > 6 ? "pr-2" : "")}>
          {events.length ? (
            events.map((event) => (
              <EventCard key={event.id} event={event} href={`/communities/events/${event.id}`} />
            ))
          ) : (
            <p className="text-sm text-slate-500">No events for this day.</p>
          )}
        </div>
      </div>
    </div>
  );
}
