"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import type { EventSummary } from "@/lib/communities";
import { formatRange, resolvedUserTimezone } from "@/utils/datetime";

function useClientTimezone() {
  const [timezone, setTimezone] = useState<string | null>(null);
  useEffect(() => {
    setTimezone(resolvedUserTimezone());
  }, []);
  return timezone;
}

export type EventCardProps = {
  event: EventSummary;
  href: string;
};

export function EventCard({ event, href }: EventCardProps) {
  const timezone = useClientTimezone();

  const timeLabel = useMemo(() => {
    if (!timezone) {
      return "";
    }
    return formatRange(event.start_at, event.end_at, event.all_day, { timeZone: timezone });
  }, [event.all_day, event.end_at, event.start_at, timezone]);

  const venueLabel = useMemo(() => {
    if (event.venue.kind === "physical") {
      return event.venue.address_line1;
    }
    return event.venue.platform ?? "Virtual";
  }, [event.venue]);

  const badgeLabel = useMemo(() => {
    if (!event.my_status || event.my_status === "none") {
      return "RSVP";
    }
    if (event.my_status === "waitlist") {
      return "Waitlisted";
    }
    return `You are ${event.my_status}`;
  }, [event.my_status]);

  return (
    <Link
      href={href}
      className={clsx(
        "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        event.status !== "scheduled" ? "opacity-80" : "",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {event.group_name}
        </span>
        <span
          className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
        >
          {badgeLabel}
        </span>
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-900">{event.title}</h3>
        {timezone ? (
          <p className="text-sm text-slate-600">{timeLabel}</p>
        ) : (
          <p className="text-sm text-slate-400">Loading time…</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
            {venueLabel}
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
            {event.going_count} going
          </span>
          {event.interested_count ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
              {event.interested_count} interested
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
