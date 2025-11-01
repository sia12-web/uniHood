import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";

import type { CurrentUser } from "@/lib/auth-guard";
import {
	createGroupPost,
	deleteGroupPost,
	linkAttachment,
	type GroupPost,
	type GroupPostsResponse,
	updateGroupPost,
} from "@/lib/communities";

import { groupPostsQueryKey, removePost, upsertPost } from "./use-posts";
import type { ReadyAttachment } from "./use-upload";

export type ComposerInput = {
	title?: string;
	body: string;
	tags: string[];
	attachments: ReadyAttachment[];
};

function buildOptimisticPost(groupId: string, author: CurrentUser, input: ComposerInput, tempId: string): GroupPost {
	return {
		id: tempId,
		group_id: groupId,
		title: input.title ?? null,
		body: input.body,
		topic_tags: input.tags,
		attachments: input.attachments.map((attachment) => ({
			id: `${tempId}-${attachment.meta.s3_key}`,
			s3_key: attachment.meta.s3_key,
			mime: attachment.meta.mime,
			size_bytes: attachment.meta.size_bytes,
			width: attachment.meta.width ?? null,
			height: attachment.meta.height ?? null,
		})),
		author: {
			id: author.id,
			display_name: author.display_name ?? null,
			handle: author.handle ?? null,
			avatar_url: author.avatar_url ?? null,
		},
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		pinned_at: null,
		editable: true,
		deletable: true,
		reactions: [],
		comments_count: 0,
	};
}

function validateInput(input: ComposerInput) {
	if (!input.body.trim() && !input.title?.trim()) {
		throw new Error("Write something before posting.");
	}
	if (input.title && input.title.length > 140) {
		throw new Error("Title must be 140 characters or fewer.");
	}
	if (input.body.length > 40_000) {
		throw new Error("Post body exceeds 40k characters.");
	}
	if (input.tags.length > 10) {
		throw new Error("Limit tags to 10 per post.");
	}
}

export function useCreatePost(groupId: string, author: CurrentUser) {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: async (input: ComposerInput) => {
			validateInput(input);
			const tempId = `temp-${crypto.randomUUID()}`;
			const optimistic = buildOptimisticPost(groupId, author, input, tempId);
			queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
				if (!existing) {
					return {
						pages: [{ items: [optimistic] }],
						pageParams: [undefined],
					};
				}
				return {
					...existing,
					pages: upsertPost(existing.pages, optimistic),
				};
			});

			try {
				const created = await createGroupPost(groupId, {
					title: input.title,
					body: input.body,
					topic_tags: input.tags,
				});
				await Promise.all(
					input.attachments.map((attachment) =>
						linkAttachment({
							subject_type: "post",
							subject_id: created.id,
							s3_key: attachment.meta.s3_key,
							mime: attachment.meta.mime,
							size_bytes: attachment.meta.size_bytes,
							width: attachment.meta.width ?? null,
							height: attachment.meta.height ?? null,
						}),
					),
				);
				queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
					if (!existing) {
						return existing;
					}
					return {
						...existing,
						pages: upsertPost(existing.pages, created),
					};
				});
				return created;
			} catch (error) {
				queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
					if (!existing) {
						return existing;
					}
					return {
						...existing,
						pages: removePost(existing.pages, tempId),
					};
				});
				throw error;
			}
		},
	});

	return mutation;
}

export function useDeletePost(groupId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (postId: string) => {
			queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
				if (!existing) {
					return existing;
				}
				return {
					...existing,
					pages: removePost(existing.pages, postId),
				};
			});
			try {
				await deleteGroupPost(postId);
			} catch (error) {
				queryClient.invalidateQueries({ queryKey: groupPostsQueryKey(groupId) });
				throw error;
			}
		},
	});
}

export function useEditPost(groupId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ postId, title, body, tags }: { postId: string; title?: string; body?: string; tags?: string[] }) => {
			const prev = queryClient.getQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId));
			if (!prev) {
				return updateGroupPost(postId, { title, body, topic_tags: tags });
			}
			const optimisticPages = prev.pages.map((page) => ({
				...page,
				items: page.items.map((item) =>
					item.id === postId
						? {
							...item,
							title: title ?? item.title ?? null,
							body: body ?? item.body,
							topic_tags: tags ?? item.topic_tags,
						}
						: item,
				),
			}));
			queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), {
				...prev,
				pages: optimisticPages,
			});

			try {
				const updated = await updateGroupPost(postId, { title, body, topic_tags: tags });
				queryClient.setQueryData<InfiniteData<GroupPostsResponse>>(groupPostsQueryKey(groupId), (existing) => {
					if (!existing) {
						return existing;
					}
					return {
						...existing,
						pages: upsertPost(existing.pages, updated),
					};
				});
				return updated;
			} catch (error) {
				queryClient.setQueryData(groupPostsQueryKey(groupId), prev);
				throw error;
			}
		},
	});
}
