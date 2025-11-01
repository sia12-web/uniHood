import { Suspense } from "react";

import { EventDetail } from "@/components/communities/events/event-detail";
import { DetailSkeleton } from "@/components/communities/events/skeletons";
import { requireCurrentUser } from "@/lib/auth-guard";

export const metadata = {
  title: "Event details",
};

type EventDetailPageProps = {
  params: { eventId: string };
};

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  await requireCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<DetailSkeleton withSidebar />}>
        <EventDetail eventId={params.eventId} />
      </Suspense>
    </div>
  );
}
