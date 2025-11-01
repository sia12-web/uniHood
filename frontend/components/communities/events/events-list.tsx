"use client";

import { ReactNode, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { EventSummary } from "@/lib/communities";

import { EventCard } from "./event-card";
import { ListSkeleton } from "./skeletons";

export type EventsListProps = {
  events: EventSummary[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage(): void;
};

const ESTIMATED_CARD_HEIGHT = 160;

export function EventsList({ events, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage }: EventsListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const shouldVirtualize = events.length > 100;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? events.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 6,
  });

  const virtualItems = useMemo(
    () => (shouldVirtualize ? virtualizer.getVirtualItems() : []),
    [shouldVirtualize, virtualizer],
  );

  const visibleEvents = useMemo(() => {
    if (!shouldVirtualize) {
      return events;
    }
    return virtualItems.map((item) => events[item.index]);
  }, [events, shouldVirtualize, virtualItems]);

  useEffect(() => {
    if (!shouldVirtualize || !hasNextPage || isFetchingNextPage) {
      return;
    }
    const last = virtualItems[virtualItems.length - 1];
    if (!last) {
      return;
    }
    if (last.index >= events.length - 5) {
      fetchNextPage();
    }
  }, [events.length, fetchNextPage, hasNextPage, isFetchingNextPage, shouldVirtualize, virtualItems]);

  useEffect(() => {
    if (!shouldVirtualize || !hasNextPage || isFetchingNextPage) {
      return;
    }
    if (events.length < 20) {
      fetchNextPage();
    }
  }, [events.length, fetchNextPage, hasNextPage, isFetchingNextPage, shouldVirtualize]);

  useEffect(() => {
    if (!shouldVirtualize || !canvasRef.current) {
      return;
    }
    canvasRef.current.style.height = `${virtualizer.getTotalSize()}px`;
  }, [canvasRef, shouldVirtualize, virtualItems, virtualizer]);

  useEffect(() => {
    if (shouldVirtualize || !hasNextPage || isFetchingNextPage) {
      return;
    }
    if (events.length < 20) {
      fetchNextPage();
    }
  }, [events.length, fetchNextPage, hasNextPage, isFetchingNextPage, shouldVirtualize]);

  if (isLoading) {
    return <ListSkeleton />;
  }

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No events to show.
      </div>
    );
  }

  if (shouldVirtualize) {
    return (
      <div ref={parentRef} className="h-[70vh] overflow-y-auto">
        <div ref={canvasRef} className="relative w-full">
          {virtualItems.map((virtualItem) => {
            const event = events[virtualItem.index];
            return (
              <VirtualizedCard key={event.id} start={virtualItem.start}>
                <EventCard event={event} href={`/communities/events/${event.id}`} />
              </VirtualizedCard>
            );
          })}
        </div>
        {hasNextPage ? (
          <div className="p-4 text-center text-sm text-slate-500">Loading more…</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleEvents.map((event) => (
        <EventCard key={event.id} event={event} href={`/communities/events/${event.id}`} />
      ))}
      {hasNextPage ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VirtualizedCard({ start, children }: { start: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.transform = `translateY(${start}px)`;
    }
  }, [start]);

  return (
    <div ref={ref} className="absolute left-0 top-0 w-full p-2 will-change-transform">
      {children}
    </div>
  );
}
