"use client";

import clsx from "clsx";

import type { EventDetail } from "@/lib/communities";
import { useRsvp } from "@/hooks/communities/use-rsvp";

const RSVP_OPTIONS = [
  { value: "going" as const, label: "Going" },
  { value: "interested" as const, label: "Interested" },
  { value: "declined" as const, label: "Decline" },
];

export function RsvpPanel({ event }: { event: EventDetail }) {
  const mutation = useRsvp(event.id);
  const rsvpClosed = event.status !== "scheduled" || event.rsvp_open === false;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-slate-900">Your RSVP</h2>
        {event.capacity ? (
          <p className="text-sm text-slate-500">
            {event.going_count}/{event.capacity} spots claimed
          </p>
        ) : (
          <p className="text-sm text-slate-500">{event.going_count} people going</p>
        )}
      </header>
      <div className="mt-4 inline-flex flex-wrap gap-2">
        {RSVP_OPTIONS.map((option) => {
          const selected = event.my_status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={rsvpClosed}
              aria-pressed={selected}
              onClick={() => mutation.mutate({ status: option.value })}
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                rsvpClosed ? "cursor-not-allowed opacity-60" : "",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {event.waitlist_count ? (
        <p className="mt-3 text-xs font-medium text-amber-600">
          Waitlist: {event.waitlist_count} people are queued.
        </p>
      ) : null}
      {mutation.status === "success" ? (
        <p className="mt-3 text-xs text-emerald-600">RSVP updated.</p>
      ) : null}
      {mutation.status === "error" ? (
        <p className="mt-3 text-xs text-red-600">We could not update your RSVP. Try again.</p>
      ) : null}
      {rsvpClosed ? (
        <p className="mt-3 text-xs text-slate-500">RSVPs are closed for this event.</p>
      ) : null}
    </section>
  );
}
