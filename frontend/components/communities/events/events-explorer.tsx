"use client";

import { useState } from "react";

import { useEventsGlobal } from "@/hooks/communities/use-events";

import { EventsCalendar } from "./calendar-view";
import { EventsList } from "./events-list";
import { FiltersBar, type EventsScope, type EventsView } from "./filters-bar";
import { ListSkeleton } from "./skeletons";

export function EventsExplorer() {
  const [scope, setScope] = useState<EventsScope>("upcoming");
  const [view, setView] = useState<EventsView>("list");

  const query = useEventsGlobal(scope);

  return (
    <div className="space-y-4">
      <FiltersBar scope={scope} view={view} onScopeChange={setScope} onViewChange={setView} />
      {view === "list" ? (
        <EventsList
          events={query.events}
          isLoading={query.isLoading}
          isFetchingNextPage={query.isFetchingNextPage}
          hasNextPage={Boolean(query.hasNextPage)}
          fetchNextPage={() => query.fetchNextPage()}
        />
      ) : query.isLoading ? (
        <ListSkeleton count={4} />
      ) : (
        <EventsCalendar events={query.events} />
      )}
    </div>
  );
}
