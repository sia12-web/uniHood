import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";

import {
  deleteComment,
  listComments,
  updateComment as updateCommentApi,
  type CommentListResponse,
  type PostComment,
  type ReactionSummary,
} from "@/lib/communities";

import { useCommunitiesSocket } from "@/components/providers/socket-provider";
import type { QueryKey } from "@tanstack/react-query";

const ROOT_KEY = "root";

export type CommentNode = PostComment & {
  reactions: ReactionSummary[];
};

export function useComments(postId: string, parentId?: string | null, options?: { enabled?: boolean }) {
  const key = createCommentKey(postId, parentId);

  return useInfiniteQuery<CommentListResponse>({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      listComments(postId, {
        parent_id: parentId ?? null,
        after: (pageParam as string | undefined) ?? null,
        limit: 50,
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 15_000,
    initialPageParam: undefined,
    enabled: options?.enabled ?? true,
  });
}

export function useCommentSocketBridge(postId: string) {
  const socket = useCommunitiesSocket();
  const queryClient = useQueryClient();
  const seenEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) {
      return;
    }

    socket.emit("post:subscribe", { postId });

    const handleCreated = (comment: PostComment & { event_id?: string }) => {
      if (comment.event_id && seenEvents.current.has(comment.event_id)) {
        return;
      }
      if (comment.event_id) {
        seenEvents.current.add(comment.event_id);
      }
      appendComment(queryClient, postId, comment.parent_id, comment);
    };

    const handleDeleted = (payload: { comment_id: string; parent_id: string | null }) => {
      removeComment(queryClient, postId, payload.parent_id, payload.comment_id);
    };

    const handleReacted = (payload: { comment_id: string; reactions: ReactionSummary[]; parent_id: string | null }) => {
      updateComment(queryClient, postId, payload.parent_id, payload.comment_id, (existing) => ({
        ...existing,
        reactions: payload.reactions,
      }));
    };

    socket.on("post:comment.created", handleCreated);
    socket.on("post:comment.deleted", handleDeleted);
    socket.on("post:comment.reaction.updated", handleReacted);

    return () => {
      socket.emit("post:unsubscribe", { postId });
      socket.off("post:comment.created", handleCreated);
      socket.off("post:comment.deleted", handleDeleted);
      socket.off("post:comment.reaction.updated", handleReacted);
    };
  }, [postId, queryClient, socket]);
}

export function useCommentTree(pages?: InfiniteData<CommentListResponse>, collapseDepth = 2) {
  return useMemo(() => {
    if (!pages) {
      return [] as Array<CommentListItem>;
    }
    const items = pages.pages.flatMap((page) => page.items);
    return items.map((comment) => ({ comment, depth: comment.depth, isCollapsed: comment.depth >= collapseDepth }));
  }, [collapseDepth, pages]);
}

export type CommentListItem = {
  comment: PostComment;
  depth: number;
  isCollapsed: boolean;
};

export function createCommentKey(postId: string, parentId?: string | null): QueryKey {
  return ["comments", postId, parentId ?? ROOT_KEY];
}

export function appendComment(queryClient: QueryClient, postId: string, parentId: string | null, comment: PostComment) {
  const key = createCommentKey(postId, parentId);
  queryClient.setQueryData<InfiniteData<CommentListResponse>>(key, (existing) => {
    if (!existing) {
      return {
        pages: [{ items: [comment] }],
        pageParams: [undefined],
      };
    }
    return {
      ...existing,
      pages: existing.pages.map((page, index) =>
        index === 0 ? { ...page, items: [comment, ...page.items.filter((item) => item.id !== comment.id)] } : page,
      ),
    };
  });
}

export function replaceComment(
  queryClient: QueryClient,
  postId: string,
  parentId: string | null,
  comment: PostComment,
) {
  const key = createCommentKey(postId, parentId);
  queryClient.setQueryData<InfiniteData<CommentListResponse>>(key, (existing) => {
    if (!existing) {
      return existing;
    }
    return {
      ...existing,
      pages: existing.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.id === comment.id ? comment : item)),
      })),
    };
  });
}

export function removeComment(
  queryClient: QueryClient,
  postId: string,
  parentId: string | null,
  commentId: string,
) {
  const key = createCommentKey(postId, parentId);
  queryClient.setQueryData<InfiniteData<CommentListResponse>>(key, (existing) => {
    if (!existing) {
      return existing;
    }
    return {
      ...existing,
      pages: existing.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== commentId),
      })),
    };
  });
}

export function updateComment(
  queryClient: QueryClient,
  postId: string,
  parentId: string | null,
  commentId: string,
  updater: (comment: PostComment) => PostComment,
) {
  const key = createCommentKey(postId, parentId);
  queryClient.setQueryData<InfiniteData<CommentListResponse>>(key, (existing) => {
    if (!existing) {
      return existing;
    }
    return {
      ...existing,
      pages: existing.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.id === commentId ? updater(item) : item)),
      })),
    };
  });
}

export function setCommentReactions(
  queryClient: QueryClient,
  postId: string,
  parentId: string | null,
  commentId: string,
  compute: (current: ReactionSummary[]) => ReactionSummary[],
) {
  updateComment(queryClient, postId, parentId, commentId, (existing) => ({
    ...existing,
    reactions: compute(existing.reactions ?? []),
  }));
}

export function useUpdateComment(postId: string, parentId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) => updateCommentApi(commentId, { body }),
    onSuccess: (updated) => {
      replaceComment(queryClient, postId, updated.parent_id, updated);
    },
  });
}

export function useDeleteComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }: { commentId: string; parentId: string | null }) => deleteComment(commentId),
    onSuccess: (_void, variables) => {
      removeComment(queryClient, postId, variables.parentId, variables.commentId);
    },
  });
}
