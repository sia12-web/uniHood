"use client";

import type { SearchResultHit } from "@/lib/community-search";
import type { EventSearchSource } from "@/lib/community-search";
import { truncateText } from "@/utils/search";

import { HighlightedText } from "./highlighted-text";

type EventResultCardProps = {
  hit: SearchResultHit<EventSearchSource>;
};

function getHighlight(hit: SearchResultHit<EventSearchSource>, field: string): string | null {
  return hit.highlight?.[field]?.[0] ?? null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function EventResultCard({ hit }: EventResultCardProps) {
  const event = hit.source;
  const titleHighlight = getHighlight(hit, "title");
  const descriptionHighlight = getHighlight(hit, "description");
  const start = formatDateTime(event.start_at);
  const end = formatDateTime(event.end_at);

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900">
            {titleHighlight ? <HighlightedText value={titleHighlight} /> : event.title}
          </h3>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {event.campus_name ? `${event.campus_name} • ` : ""}
            {event.group_name ?? "Community event"}
          </p>
        </div>
        <div className="text-right text-xs font-medium text-slate-600">
          <p>{start}</p>
          <p className="text-slate-400">{end}</p>
        </div>
      </header>
      <p className="text-sm text-slate-600">
        {descriptionHighlight ? <HighlightedText value={descriptionHighlight} /> : truncateText(event.description ?? "")}
      </p>
      <footer className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {event.venue_label ? <span>{event.venue_label}</span> : null}
        {typeof event.going_count === "number" ? <span>{event.going_count} going</span> : null}
        {event.tags?.length ? (
          <span className="flex flex-wrap gap-1">
            {event.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                #{tag}
              </span>
            ))}
            {event.tags.length > 4 ? <span>+{event.tags.length - 4} more</span> : null}
          </span>
        ) : null}
      </footer>
    </article>
  );
}
