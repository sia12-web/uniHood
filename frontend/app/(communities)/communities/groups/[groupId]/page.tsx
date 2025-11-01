import { GroupPostsView } from "@/components/communities/group/posts-view";
import type { CurrentUser } from "@/lib/auth-guard";
import { requireCurrentUser } from "@/lib/auth-guard";

export default async function GroupPostsPage({ params }: { params: { groupId: string } }) {
	const me: CurrentUser = await requireCurrentUser();

	return <GroupPostsView groupId={params.groupId} currentUser={me} />;
}
