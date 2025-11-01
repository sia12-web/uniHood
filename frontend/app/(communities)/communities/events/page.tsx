import { EventsExplorer } from "@/components/communities/events/events-explorer";
import { requireCurrentUser } from "@/lib/auth-guard";

export const metadata = {
  title: "Community Events",
};

export default async function CommunitiesEventsPage() {
  await requireCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-slate-900">Events</h1>
        <p className="text-sm text-slate-600">Discover upcoming meetups across all of your communities.</p>
      </header>
      <EventsExplorer />
    </div>
  );
}
