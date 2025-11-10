"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";

import { ReportUI } from "@/app/features/moderation/ReportButton";
import { useComments, useDeleteComment, useUpdateComment } from "@/hooks/communities/use-comments";
import type { CurrentUser } from "@/lib/auth-guard";
import type { PostComment } from "@/lib/communities";
import { usePresence } from "@/hooks/presence/use-presence";
import type { PresenceStatus } from "@/store/presence";
import type { CommentListResponse } from "@/lib/communities";

import { ReactionBar } from "../post/reaction-bar";
import { CommentComposer } from "./comment-composer";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export type CommentItemProps = {
  comment: PostComment;
  postId: string;
  currentUser: CurrentUser;
  level?: number;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  presence?: PresenceStatus | null;
};

export function CommentItem({ comment, postId, currentUser, level = 0, onTypingStart, onTypingStop, presence }: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  const updateMutation = useUpdateComment(postId, comment.parent_id);
  const deleteMutation = useDeleteComment(postId);

  useEffect(() => {
    setEditBody(comment.body);
  }, [comment.body]);

  const authorName = useMemo(() => {
    if (comment.author.display_name) {
      return comment.author.display_name;
    }
    if (comment.author.handle) {
      return `@${comment.author.handle}`;
    }
    return "Community member";
  }, [comment.author.display_name, comment.author.handle]);
  const presenceIndicatorClass = presence?.online ? "bg-emerald-500" : "bg-slate-300";
  const statusLabel = useMemo(() => {
    if (!presence) {
      return null;
    }
    if (presence.online) {
      return "Online now";
    }
    if (presence.lastSeen) {
      const parsed = new Date(presence.lastSeen);
      if (!Number.isNaN(parsed.getTime())) {
        return `Last active ${formatDistanceToNow(parsed, { addSuffix: true })}`;
      }
    }
    return "Offline";
  }, [presence]);
  const statusTextClass = presence?.online ? "text-emerald-600" : "text-slate-400";

  const timestamp = useMemo(() => formatDate(comment.created_at), [comment.created_at]);
  const isEdited = comment.updated_at !== comment.created_at;
  const indentClass = useMemo(() => {
    const classes = ["", "ml-6", "ml-12", "ml-20", "ml-24"] as const;
    return classes[Math.min(level, classes.length - 1)];
  }, [level]);
  const isDeleted = Boolean(comment.is_deleted);

  const handleReplyToggle = useCallback(() => {
    setIsReplying((prev) => !prev);
  }, []);

  const handleEditSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = editBody.trim();
      if (!trimmed) {
        return;
      }
      try {
        await updateMutation.mutateAsync({ commentId: comment.id, body: trimmed });
        setIsEditing(false);
      } catch (error) {
        console.warn("Failed to update comment", error);
      }
    },
    [comment.id, editBody, updateMutation],
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync({ commentId: comment.id, parentId: comment.parent_id ?? null });
      setConfirmDelete(false);
    } catch (error) {
      console.warn("Failed to delete comment", error);
    }
  }, [comment.id, comment.parent_id, deleteMutation]);

  return (
    <li className={clsx("list-none", indentClass)}>
      <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <header className="flex items-start gap-3">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {comment.author.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={comment.author.avatar_url} alt={authorName} className="h-full w-full object-cover" />
            ) : (
              authorName.charAt(0).toUpperCase()
            )}
            {presence ? (
              <span
                className={clsx(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                  presenceIndicatorClass,
                )}
                aria-hidden
              />
            ) : null}
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2 text-sm">
              <p className="font-semibold text-slate-900">{authorName}</p>
              <span className="text-xs text-slate-500">{timestamp}</span>
              {isEdited ? <span className="text-xs text-slate-400">• Edited</span> : null}
              {statusLabel ? <span className={clsx("text-xs", statusTextClass)}>{statusLabel}</span> : null}
            </div>
            {isDeleted ? (
              <p className="text-sm italic text-slate-500">This comment was deleted.</p>
            ) : isEditing ? (
              <form onSubmit={handleEditSubmit} className="space-y-3">
                <textarea
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                  rows={3}
                  aria-label="Edit comment"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
                />
                {updateMutation.isError ? (
                  <p className="text-xs text-red-600">
                    {updateMutation.error instanceof Error ? updateMutation.error.message : "Unable to update comment."}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
                    onClick={() => {
                      setIsEditing(false);
                      setEditBody(comment.body);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-midnight px-3 py-1 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-800">{comment.body}</p>
            )}
          </div>
          {!isDeleted ? <ReportUI kind="comment" targetId={comment.id} className="ml-auto" /> : null}
        </header>

        {!isDeleted ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <button
              type="button"
              onClick={handleReplyToggle}
              className="rounded-full border border-slate-200 px-3 py-1 font-semibold transition hover:border-midnight hover:text-midnight"
            >
              {isReplying ? "Cancel reply" : "Reply"}
            </button>
            {comment.can_edit ? (
              <button
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                className="rounded-full border border-slate-200 px-3 py-1 font-semibold transition hover:border-midnight hover:text-midnight"
              >
                {isEditing ? "Close editor" : "Edit"}
              </button>
            ) : null}
            {comment.can_delete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete((prev) => !prev)}
                className="rounded-full border border-red-200 px-3 py-1 font-semibold text-red-600 transition hover:border-red-300 hover:text-red-700"
              >
                Delete
              </button>
            ) : null}
            {comment.replies_count > 0 ? (
              <button
                type="button"
                onClick={() => setShowReplies((prev) => !prev)}
                className="rounded-full border border-slate-200 px-3 py-1 font-semibold transition hover:border-midnight hover:text-midnight"
              >
                {showReplies ? "Hide replies" : `View replies (${comment.replies_count})`}
              </button>
            ) : null}
          </div>
        ) : null}

        {!isDeleted ? (
          <ReactionBar
            subject={{ type: "comment", postId, commentId: comment.id, parentId: comment.parent_id ?? null }}
            reactions={comment.reactions ?? []}
          />
        ) : null}

        {confirmDelete ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <p className="font-semibold">Delete this comment?</p>
            <p>This action cannot be undone.</p>
            {deleteMutation.isError ? (
              <p className="text-red-600">
                {deleteMutation.error instanceof Error ? deleteMutation.error.message : "Something went wrong."}
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-full border border-red-200 px-3 py-1 font-semibold text-red-600 transition hover:border-red-300 hover:text-red-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="rounded-full bg-red-600 px-3 py-1 font-semibold text-white shadow-sm transition enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ) : null}

        {isReplying && !isDeleted ? (
          <CommentComposer
            postId={postId}
            currentUser={currentUser}
            parentId={comment.id}
            depth={level + 1}
            onCancel={() => setIsReplying(false)}
            onSubmitted={() => setIsReplying(false)}
            autoFocus
            placeholder="Write a reply"
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
          />
        ) : null}

        {comment.replies_count > 0 ? (
          <CommentReplies
            enabled={showReplies}
            postId={postId}
            parentId={comment.id}
            currentUser={currentUser}
            level={level + 1}
            onTypingStart={onTypingStart}
            onTypingStop={onTypingStop}
          />
        ) : null}
      </article>
    </li>
  );
}

type CommentRepliesProps = {
  enabled: boolean;
  postId: string;
  parentId: string;
  currentUser: CurrentUser;
  level: number;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
};

function CommentReplies({ enabled, postId, parentId, currentUser, level, onTypingStart, onTypingStop }: CommentRepliesProps) {
  const query = useComments(postId, parentId, { enabled });

  const replies = useMemo(() => {
    if (!query.data) {
      return [] as PostComment[];
    }
    return query.data.pages.flatMap((page: CommentListResponse) => page.items);
  }, [query.data]);

  const replyAuthorIds = useMemo(
    () => replies.map((reply) => reply.author?.id).filter((id): id is string => Boolean(id)),
    [replies],
  );
  const { presence: replyPresence } = usePresence(replyAuthorIds);

  if (!enabled) {
    return null;
  }

  if (query.isLoading) {
    return <p className="pl-4 text-xs text-slate-500">Loading replies…</p>;
  }

  if (query.isError) {
    return (
      <div className="pl-4 text-xs text-red-600">
        {query.error instanceof Error ? query.error.message : "Unable to load replies."}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-l border-slate-200 pl-4">
      {replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          postId={postId}
          currentUser={currentUser}
          level={level}
          presence={reply.author?.id ? replyPresence[reply.author.id] ?? null : null}
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
        />
      ))}
      {query.hasNextPage ? (
        <button
          type="button"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="self-start rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-midnight hover:text-midnight disabled:cursor-not-allowed disabled:opacity-70"
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more replies"}
        </button>
      ) : null}
      {query.isFetching && !query.isFetchingNextPage ? (
        <p className="text-xs text-slate-400">Refreshing…</p>
      ) : null}
    </div>
  );
}
