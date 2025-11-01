import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createReaction, deleteReaction, type ReactionSummary } from "@/lib/communities";

import { updatePostInCaches } from "./cache-utils";
import { setCommentReactions } from "./use-comments";

type ReactionSubject =
  | { type: "post"; postId: string }
  | { type: "comment"; postId: string; commentId: string; parentId: string | null };

function adjustReactions(reactions: ReactionSummary[], emoji: string, delta: number, viewerHasReacted: boolean): ReactionSummary[] {
  const existing = reactions.find((item) => item.emoji === emoji);
  if (!existing) {
    if (delta < 0) {
      return reactions;
    }
    return [...reactions, { emoji, count: Math.max(1, delta), viewer_has_reacted: viewerHasReacted }];
  }

  const nextCount = Math.max(0, existing.count + delta);
  if (nextCount === 0) {
    return reactions.filter((item) => item.emoji !== emoji);
  }
  return reactions.map((item) =>
    item.emoji === emoji
      ? {
          ...item,
          count: nextCount,
          viewer_has_reacted: viewerHasReacted,
        }
      : item,
  );
}

function applyOptimisticUpdate(queryClient: ReturnType<typeof useQueryClient>, subject: ReactionSubject, emoji: string, delta: number, viewer: boolean) {
  if (subject.type === "post") {
    updatePostInCaches(queryClient, subject.postId, (post) => ({
      ...post,
      reactions: adjustReactions(post.reactions ?? [], emoji, delta, viewer),
    }));
  } else {
    setCommentReactions(queryClient, subject.postId, subject.parentId, subject.commentId, (previous) =>
      adjustReactions(previous, emoji, delta, viewer),
    );
  }
}

export function useReaction(subject: ReactionSubject) {
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: (emoji: string) =>
      createReaction({
        subject_type: subject.type,
        subject_id: subject.type === "post" ? subject.postId : subject.commentId,
        emoji,
      }),
    onMutate: (emoji) => {
      applyOptimisticUpdate(queryClient, subject, emoji, 1, true);
    },
    onError: (_error, emoji) => {
      applyOptimisticUpdate(queryClient, subject, emoji, -1, false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (emoji: string) =>
      deleteReaction({
        subject_type: subject.type,
        subject_id: subject.type === "post" ? subject.postId : subject.commentId,
        emoji,
      }),
    onMutate: (emoji) => {
      applyOptimisticUpdate(queryClient, subject, emoji, -1, false);
    },
    onError: (_error, emoji) => {
      applyOptimisticUpdate(queryClient, subject, emoji, 1, true);
    },
  });

  return {
    addReaction: addMutation.mutate,
    removeReaction: removeMutation.mutate,
    isProcessing: addMutation.isPending || removeMutation.isPending,
  };
}
