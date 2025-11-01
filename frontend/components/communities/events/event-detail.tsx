"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useEvent } from "@/hooks/communities/use-event";
import type { EventDetail as EventDetailType } from "@/lib/communities";
import { formatRange, resolvedUserTimezone } from "@/utils/datetime";

import { AttendeesPanel } from "./attendees-panel";
import { DetailSkeleton } from "./skeletons";
import { IcsButton } from "./ics-button";
import { ReminderToggle } from "./reminder-toggle";
import { RsvpPanel } from "./rsvp-panel";
import { VenueBlock } from "./venue-block";

function EventDetailContent({ event }: { event: EventDetailType }) {
  const [timezone, setTimezone] = useState<string | null>(null);

  useEffect(() => {
    setTimezone(resolvedUserTimezone());
  }, []);

  const when = useMemo(() => {
    if (!timezone) {
      return "";
    }
    return formatRange(event.start_at, event.end_at, event.all_day, { timeZone: timezone });
  }, [event.all_day, event.end_at, event.start_at, timezone]);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
      <article className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex flex-col gap-2">
          <Link href={`/communities/groups/${event.group_id}`} className="text-sm font-semibold text-slate-500">
            {event.group_name}
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">{event.title}</h1>
          {timezone ? (
            <p className="text-sm text-slate-600">{when}</p>
          ) : (
            <p className="text-sm text-slate-400">Loading time…</p>
          )}
          {event.tags?.length ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {event.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
        </header>
        {event.description ? (
          <section className="prose max-w-none text-slate-700">
            <p className="whitespace-pre-line">{event.description}</p>
          </section>
        ) : null}
        <VenueBlock venue={event.venue} />
      </article>
      <aside className="space-y-4">
        <RsvpPanel event={event} />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700">Stay organised</h3>
          <div className="mt-3 flex flex-col gap-2">
            <IcsButton eventId={event.id} />
            <ReminderToggle eventId={event.id} />
          </div>
        </div>
        <AttendeesPanel attendees={event.attendees_preview} />
      </aside>
    </div>
  );
}

export function EventDetail({ eventId }: { eventId: string }) {
  const query = useEvent(eventId);

  if (query.isLoading || !query.data) {
    return <DetailSkeleton withSidebar />;
  }

  return <EventDetailContent event={query.data} />;
}
