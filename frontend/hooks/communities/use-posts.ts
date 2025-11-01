import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";

import { useCommunitiesSocket } from "@/components/providers/socket-provider";
import { listGroupPosts, type GroupPost, type GroupPostsResponse } from "@/lib/communities";

import { useKeyset } from "./use-keyset";

export function groupPostsQueryKey(groupId: string) {
	return ["groupPosts", groupId] as const;
}

export function upsertPost(pages: GroupPostsResponse[], incoming: GroupPost): GroupPostsResponse[] {
	if (pages.length === 0) {
		return [{ items: [incoming] }];
	}
	const [first, ...rest] = pages;
	const withoutExisting = first.items.filter((item) => item.id !== incoming.id);
	return [{ ...first, items: [incoming, ...withoutExisting] }, ...rest];
}

function updatePost(pages: GroupPostsResponse[], incoming: GroupPost): GroupPostsResponse[] {
	return pages.map((page) => ({
		...page,
		items: page.items.map((item) => (item.id === incoming.id ? { ...item, ...incoming } : item)),
	}));
}

export function removePost(pages: GroupPostsResponse[], postId: string): GroupPostsResponse[] {
	return pages
		.map((page) => ({
			...page,
			items: page.items.filter((item) => item.id !== postId),
		}))
		.filter((page) => page.items.length > 0 || page.next_cursor);
}

export function useGroupPosts(groupId: string) {
	const { getNextPageParam, flattenPages } = useKeyset<GroupPost>();
	const queryClient = useQueryClient();
	const socket = useCommunitiesSocket();

	const query = useInfiniteQuery({
		queryKey: groupPostsQueryKey(groupId),
		queryFn: ({ pageParam }) => listGroupPosts(groupId, { before: pageParam, limit: 20 }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => getNextPageParam(page),
		staleTime: 30_000,
	});

	const posts = useMemo(() => flattenPages(query.data?.pages), [flattenPages, query.data?.pages]);

	useEffect(() => {
		if (!socket) {
			return;
		}
		socket.emit("group:subscribe", { groupId });

		const handleCreated = (incoming: GroupPost) => {
			queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
				if (!existing) {
					return {
						pages: [{ items: [incoming] }],
						pageParams: [undefined],
					};
				}
				return {
					...existing,
					pages: upsertPost(existing.pages, incoming),
				};
			});
		};

		const handleUpdated = (incoming: GroupPost) => {
			queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
				if (!existing) {
					return existing;
				}
				return {
					...existing,
					pages: updatePost(existing.pages, incoming),
				};
			});
		};

		const handleDeleted = (payload: { id: string }) => {
			queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
				if (!existing) {
					return existing;
				}
				return {
					...existing,
					pages: removePost(existing.pages, payload.id),
				};
			});
		};

		socket.on("group:post.created", handleCreated);
		socket.on("group:post.updated", handleUpdated);
		socket.on("group:post.deleted", handleDeleted);

		return () => {
			socket.emit("group:unsubscribe", { groupId });
			socket.off("group:post.created", handleCreated);
			socket.off("group:post.updated", handleUpdated);
			socket.off("group:post.deleted", handleDeleted);
		};
	}, [groupId, queryClient, socket]);

	const prependOptimistic = (post: GroupPost) => {
		queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
			if (!existing) {
				return {
					pages: [{ items: [post] }],
					pageParams: [undefined],
				};
			}
			return {
				...existing,
				pages: upsertPost(existing.pages, post),
			};
		});
	};

	const removeOptimistic = (postId: string) => {
		queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
			if (!existing) {
				return existing;
			}
			return {
				...existing,
				pages: removePost(existing.pages, postId),
			};
		});
	};

	return {
		...query,
		posts,
		prependOptimistic,
		removeOptimistic,
	};
}