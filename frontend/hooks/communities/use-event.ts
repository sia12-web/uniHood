import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useCommunitiesSocket } from "@/components/providers/socket-provider";
import { getEvent, type EventDetail, type EventSummary } from "@/lib/communities";
import { useToast } from "@/hooks/use-toast";

import { replaceEventDetail, updateEventInCaches } from "./cache-utils";

export function eventQueryKey(eventId: string) {
  return ["event", eventId] as const;
}

export function useEvent(eventId: string) {
  const queryClient = useQueryClient();
  const socket = useCommunitiesSocket();
  const { push } = useToast();

  const query = useQuery({
    queryKey: eventQueryKey(eventId),
    queryFn: () => getEvent(eventId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!socket) {
      return;
    }
    socket.emit("event:subscribe", { eventId });

    const applyDetail = (detail: EventDetail) => {
      replaceEventDetail(queryClient, detail);
    };

    const applySummary = (summary: EventSummary) => {
      updateEventInCaches(queryClient, summary.id, (prev) => ({ ...prev, ...summary }));
    };

    const handleUpdated = (payload: EventSummary | EventDetail) => {
      const previous = queryClient.getQueryData<EventDetail>(eventQueryKey(eventId));
      if ((payload as EventDetail).attendees_preview) {
        const detail = payload as EventDetail;
        applyDetail(detail);
        if (detail.status === "cancelled" && previous?.status !== "cancelled") {
          push({
            id: `event:${detail.id}:cancelled`,
            title: "Event cancelled",
            description: `${detail.title} has been cancelled.`,
            variant: "warning",
            duration: 8000,
          });
        }
      } else {
        const summary = payload as EventSummary;
        applySummary(summary);
        if (summary.status === "cancelled" && previous?.status !== "cancelled") {
          push({
            id: `event:${summary.id}:cancelled`,
            title: "Event cancelled",
            description: `${summary.title} has been cancelled.`,
            variant: "warning",
            duration: 8000,
          });
        }
      }
    };

    const handleRsvpUpdated = (payload: EventDetail) => applyDetail(payload);
    const handleRsvpPromoted = (payload: EventDetail) => {
      applyDetail(payload);
      push({
        id: `event:${payload.id}:promoted`,
        title: "You're off the waitlist",
        description: `Your spot for ${payload.title} is confirmed.`,
        variant: "success",
      });
    };

    socket.on("event:updated", handleUpdated);
    socket.on("event:rsvp.updated", handleRsvpUpdated);
    socket.on("event:rsvp.promoted", handleRsvpPromoted);

    return () => {
      socket.emit("event:unsubscribe", { eventId });
      socket.off("event:updated", handleUpdated);
      socket.off("event:rsvp.updated", handleRsvpUpdated);
      socket.off("event:rsvp.promoted", handleRsvpPromoted);
    };
  }, [eventId, push, queryClient, socket]);

  return query;
}
