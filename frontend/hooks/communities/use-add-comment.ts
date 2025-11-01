import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createComment, type GroupPostAuthor, type PostComment } from "@/lib/communities";

import { adjustPostCommentCount } from "./cache-utils";
import { appendComment, removeComment, replaceComment } from "./use-comments";

export type AddCommentInput = {
  body: string;
  parentId?: string | null;
  depth?: number;
  author: GroupPostAuthor;
};

export function useAddComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddCommentInput) =>
      createComment(postId, {
        body: input.body,
        parent_id: input.parentId ?? null,
      }),
    onMutate: async (input) => {
      const optimistic: PostComment = {
        id: `tmp:${crypto.randomUUID()}`,
        post_id: postId,
        parent_id: input.parentId ?? null,
        body: input.body,
        depth: input.depth ?? (input.parentId ? 1 : 0),
        author: input.author,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reactions: [],
        replies_count: 0,
        can_edit: true,
        can_delete: true,
      };
      appendComment(queryClient, postId, optimistic.parent_id, optimistic);
      adjustPostCommentCount(queryClient, postId, 1);
      return { tempId: optimistic.id, parentId: optimistic.parent_id };
    },
    onError: (_error, _vars, context) => {
      if (context) {
        removeComment(queryClient, postId, context.parentId ?? null, context.tempId);
        adjustPostCommentCount(queryClient, postId, -1);
      }
    },
    onSuccess: (real, _vars, context) => {
      replaceComment(queryClient, postId, real.parent_id, real);
      if (context?.tempId && context.parentId !== real.parent_id) {
        removeComment(queryClient, postId, context.parentId ?? null, context.tempId);
      }
    },
  });
}
