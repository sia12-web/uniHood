"use client";

import { EmptyState } from "@/components/communities/empty-state";
import type { CurrentUser } from "@/lib/auth-guard";
import { useGroupPosts } from "@/hooks/communities/use-posts";

import { PostCard } from "./post-card";
import { PostCardSkeleton } from "./skeletons";

export function PostList({ groupId, currentUser }: { groupId: string; currentUser: CurrentUser }) {
	const query = useGroupPosts(groupId);
	const { posts, isLoading, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage, isFetching } = query;

	if (isLoading && posts.length === 0) {
		return (
			<div className="space-y-4">
				<PostCardSkeleton />
				<PostCardSkeleton />
			</div>
		);
	}

	if (isError) {
		return (
			<div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
				<p className="font-semibold">We could not load the latest posts.</p>
				<p className="text-red-600">{error instanceof Error ? error.message : "Try again in a moment."}</p>
			</div>
		);
	}

	if (!isLoading && posts.length === 0) {
		return (
			<EmptyState
				title="Be the first to post"
				description="Share updates, drop files, or ask a question to kick off the conversation."
			/>
		);
	}

	return (
		<div className="space-y-4">
			{posts.map((post) => (
				<PostCard key={post.id} post={post} groupId={groupId} currentUser={currentUser} />
			))}
			{hasNextPage ? (
				<div className="flex items-center justify-center pt-2">
					<button
						type="button"
						onClick={() => fetchNextPage()}
						disabled={isFetchingNextPage}
						className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-midnight hover:text-midnight disabled:cursor-not-allowed disabled:opacity-70"
					>
						{isFetchingNextPage ? "Loading…" : "Load more"}
					</button>
				</div>
			) : null}
			{isFetching && !isFetchingNextPage ? <p className="text-center text-xs text-slate-500">Updating…</p> : null}
		</div>
	);
}
