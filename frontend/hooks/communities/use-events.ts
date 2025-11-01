import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";

import { useCommunitiesSocket } from "@/components/providers/socket-provider";
import {
  listEvents,
  listGroupEvents,
  type EventListResponse,
  type EventSummary,
} from "@/lib/communities";

import { useKeyset } from "./use-keyset";

const DEFAULT_LIMIT = 20;

type Scope = "upcoming" | "past" | "all";

function sortEvents(events: EventSummary[]): EventSummary[] {
  return events.slice().sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}

function mergeEventPages(pages: EventListResponse[] | undefined, incoming: EventSummary): EventListResponse[] {
  if (!pages || pages.length === 0) {
    return [{ items: [incoming] }];
  }
  const seen = new Set<string>();
  const updated = pages.map((page) => ({ ...page, items: page.items.slice() }));
  updated[0].items = sortEvents([incoming, ...updated[0].items.filter((item) => item.id !== incoming.id)]);
  seen.add(incoming.id);
  for (let pageIndex = 1; pageIndex < updated.length; pageIndex += 1) {
    updated[pageIndex].items = updated[pageIndex].items.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }
  return updated;
}

function updateEvent(pages: EventListResponse[] | undefined, incoming: EventSummary): EventListResponse[] | undefined {
  if (!pages) {
    return pages;
  }
  return pages.map((page) => ({
    ...page,
    items: page.items.map((item) => (item.id === incoming.id ? { ...item, ...incoming } : item)),
  }));
}

function removeEvent(pages: EventListResponse[] | undefined, eventId: string): EventListResponse[] | undefined {
  if (!pages) {
    return pages;
  }
  return pages
    .map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== eventId),
    }))
    .filter((page) => page.items.length > 0 || page.next_cursor);
}

function setQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  key: QueryKey,
  updater: (existing: InfiniteData<EventListResponse> | undefined) => InfiniteData<EventListResponse> | undefined,
) {
  queryClient.setQueryData<InfiniteData<EventListResponse>>(key, updater);
}

export function eventsGlobalQueryKey(scope: Scope) {
  return ["eventsGlobal", scope] as const;
}

export function groupEventsQueryKey(groupId: string, scope: Scope) {
  return ["eventsGroup", groupId, scope] as const;
}

export function useEventsGlobal(scope: Scope = "upcoming") {
  const { getNextPageParam, flattenPages } = useKeyset<EventSummary>();

  const query = useInfiniteQuery<EventListResponse>({
    queryKey: eventsGlobalQueryKey(scope),
    queryFn: ({ pageParam }) =>
      listEvents({ scope, limit: DEFAULT_LIMIT, after: (pageParam as string | undefined) ?? null }),
    initialPageParam: undefined,
    getNextPageParam: (page) => getNextPageParam(page),
    staleTime: 30_000,
  });

  const events = useMemo(() => {
    const flat = flattenPages(query.data?.pages);
    const deduped = new Map<string, EventSummary>();
    flat.forEach((item) => {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, item);
      }
    });
    return sortEvents(Array.from(deduped.values()));
  }, [flattenPages, query.data?.pages]);

  return { ...query, events };
}

export function useGroupEvents(groupId: string, scope: Scope = "upcoming") {
  const queryClient = useQueryClient();
  const socket = useCommunitiesSocket();
  const { getNextPageParam, flattenPages } = useKeyset<EventSummary>();

  const query = useInfiniteQuery<EventListResponse>({
    queryKey: groupEventsQueryKey(groupId, scope),
    queryFn: ({ pageParam }) =>
      listGroupEvents(groupId, { scope, limit: DEFAULT_LIMIT, after: (pageParam as string | undefined) ?? null }),
    initialPageParam: undefined,
    getNextPageParam: (page) => getNextPageParam(page),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!socket) {
      return;
    }
    socket.emit("group:events.subscribe", { groupId });

    const handleCreated = (incoming: EventSummary) => {
      setQueryData(queryClient, groupEventsQueryKey(groupId, scope), (existing) => {
        if (!existing) {
          return {
            pageParams: [undefined],
            pages: [{ items: [incoming] }],
          };
        }
        return {
          pageParams: existing.pageParams,
          pages: mergeEventPages(existing.pages, incoming),
        };
      });
      setQueryData(queryClient, eventsGlobalQueryKey(scope), (existing) => {
        if (!existing) {
          return existing;
        }
        return {
          pageParams: existing.pageParams,
          pages: mergeEventPages(existing.pages, incoming),
        };
      });
    };

    const handleUpdated = (incoming: EventSummary) => {
      setQueryData(queryClient, groupEventsQueryKey(groupId, scope), (existing) => {
        if (!existing) {
          return existing;
        }
        const pages = updateEvent(existing.pages, incoming);
        if (!pages) {
          return existing;
        }
        return {
          pageParams: existing.pageParams,
          pages,
        };
      });
      setQueryData(queryClient, eventsGlobalQueryKey(scope), (existing) => {
        if (!existing) {
          return existing;
        }
        const pages = updateEvent(existing.pages, incoming);
        if (!pages) {
          return existing;
        }
        return {
          pageParams: existing.pageParams,
          pages,
        };
      });
    };

    const handleDeleted = (payload: { id: string }) => {
      setQueryData(queryClient, groupEventsQueryKey(groupId, scope), (existing) => {
        if (!existing) {
          return existing;
        }
        const pages = removeEvent(existing.pages, payload.id);
        if (!pages) {
          return existing;
        }
        return {
          pageParams: existing.pageParams,
          pages,
        };
      });
      setQueryData(queryClient, eventsGlobalQueryKey(scope), (existing) => {
        if (!existing) {
          return existing;
        }
        const pages = removeEvent(existing.pages, payload.id);
        if (!pages) {
          return existing;
        }
        return {
          pageParams: existing.pageParams,
          pages,
        };
      });
    };

    socket.on("group:event.created", handleCreated);
    socket.on("group:event.updated", handleUpdated);
    socket.on("group:event.deleted", handleDeleted);

    return () => {
      socket.emit("group:events.unsubscribe", { groupId });
      socket.off("group:event.created", handleCreated);
      socket.off("group:event.updated", handleUpdated);
      socket.off("group:event.deleted", handleDeleted);
    };
  }, [groupId, queryClient, scope, socket]);

  const events = useMemo(() => sortEvents(flattenPages(query.data?.pages)), [flattenPages, query.data?.pages]);

  return { ...query, events };
}
