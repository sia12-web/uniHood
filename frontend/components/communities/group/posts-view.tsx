"use client";

import { useMemo } from "react";

import type { CurrentUser } from "@/lib/auth-guard";

import { useGroupContext } from "./context";
import { LockedBanner } from "./locked-banner";
import { PostComposer } from "./post-composer";
import { PostList } from "./post-list";

export function GroupPostsView({ groupId, currentUser }: { groupId: string; currentUser: CurrentUser }) {
	const group = useGroupContext();
	const canCompose = useMemo(() => !group.is_locked, [group.is_locked]);

	return (
		<div className="flex flex-col gap-6">
			{canCompose ? <PostComposer groupId={groupId} currentUser={currentUser} /> : <LockedBanner />}
			<PostList groupId={groupId} currentUser={currentUser} />
		</div>
	);
}
