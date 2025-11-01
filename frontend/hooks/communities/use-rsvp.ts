import { useMutation, useQueryClient } from "@tanstack/react-query";

import { submitEventRsvp, type EventDetail, type EventSummary } from "@/lib/communities";

import { replaceEventDetail, updateEventInCaches } from "./cache-utils";
import { eventQueryKey } from "./use-event";

export type RsvpInput = {
  status: "going" | "interested" | "declined";
  guests?: number;
};

export function optimisticRsvpApply(event: EventSummary, input: RsvpInput): EventSummary {
  const previousStatus = event.my_status ?? "none";
  const nextStatus = input.status;
  const counts = {
    going: event.going_count,
    interested: event.interested_count,
    waitlist: event.waitlist_count,
  };

  const decrement = (status: EventSummary["my_status"]) => {
    if (status === "going") {
      counts.going = Math.max(0, counts.going - 1);
    }
    if (status === "interested") {
      counts.interested = Math.max(0, counts.interested - 1);
    }
    if (status === "waitlist") {
      counts.waitlist = Math.max(0, counts.waitlist - 1);
    }
  };

  const increment = (status: RsvpInput["status"]) => {
    if (status === "going") {
      counts.going += 1;
    }
    if (status === "interested") {
      counts.interested += 1;
    }
  };

  decrement(previousStatus as EventSummary["my_status"]);
  increment(nextStatus);

  return {
    ...event,
    going_count: counts.going,
    interested_count: counts.interested,
    waitlist_count: counts.waitlist,
    my_status: nextStatus,
    my_guests: input.guests ?? 0,
  };
}

export function useRsvp(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RsvpInput) => submitEventRsvp(eventId, input),
    onMutate: async (input) => {
      const previousDetail = queryClient.getQueryData<EventDetail>(eventQueryKey(eventId));
      updateEventInCaches(queryClient, eventId, (event) => optimisticRsvpApply(event, input));
      return { previousDetail };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousDetail) {
        replaceEventDetail(queryClient, context.previousDetail);
      }
    },
    onSuccess: (server) => {
      replaceEventDetail(queryClient, server);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["eventsGlobal"] });
      queryClient.invalidateQueries({ queryKey: ["eventsGroup"] });
    },
  });
}
