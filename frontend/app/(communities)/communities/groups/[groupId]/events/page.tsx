import { GroupEventsBoard } from "@/components/communities/events/group-events-board";
import { requireCurrentUser } from "@/lib/auth-guard";

export const metadata = {
  title: "Group events",
};

export default async function GroupEventsPage({ params }: { params: { groupId: string } }) {
  await requireCurrentUser();

  return <GroupEventsBoard groupId={params.groupId} />;
}
