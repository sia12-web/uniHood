"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";

import { useAddComment } from "@/hooks/communities/use-add-comment";
import type { CurrentUser } from "@/lib/auth-guard";
import type { GroupPostAuthor } from "@/lib/communities";

function toAuthor(user: CurrentUser): GroupPostAuthor {
  return {
    id: user.id,
    display_name: user.display_name ?? null,
    handle: user.handle ?? null,
    avatar_url: user.avatar_url ?? null,
  };
}

export type CommentComposerProps = {
  postId: string;
  currentUser: CurrentUser;
  parentId?: string | null;
  depth?: number;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  onSubmitted?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
};

export function CommentComposer({
  postId,
  currentUser,
  parentId = null,
  depth,
  placeholder,
  autoFocus,
  onCancel,
  onSubmitted,
  onTypingStart,
  onTypingStop,
}: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addComment = useAddComment(postId);

  const disabled = addComment.isPending || body.trim().length === 0;

  const label = useMemo(() => {
    if (placeholder) {
      return placeholder;
    }
    return parentId ? "Write a reply" : "Add a comment";
  }, [parentId, placeholder]);

  useEffect(() => {
    return () => {
      onTypingStop?.();
    };
  }, [onTypingStop]);

  const handleChange = useCallback(
    (value: string) => {
      setBody(value);
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        onTypingStart?.();
      } else {
        onTypingStop?.();
      }
    },
    [onTypingStart, onTypingStop],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = body.trim();
      if (!trimmed || addComment.isPending) {
        return;
      }
      setError(null);
      try {
        await addComment.mutateAsync({
          body: trimmed,
          parentId,
          depth,
          author: toAuthor(currentUser),
        });
        setBody("");
        onTypingStop?.();
        onSubmitted?.();
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Unable to post comment.");
      }
    },
    [addComment, body, currentUser, depth, onSubmitted, onTypingStop, parentId],
  );

  return (
    <form onSubmit={handleSubmit} className={clsx("space-y-3", parentId ? "rounded-xl bg-slate-50 p-4" : "")}> 
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        <textarea
          value={body}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={() => onTypingStop?.()}
          rows={parentId ? 3 : 4}
          autoFocus={autoFocus}
          className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
          placeholder={parentId ? "Reply" : "Share your thoughts"}
        />
      </label>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={() => {
              onTypingStop?.();
              onCancel();
            }}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={disabled}
          className="rounded-full bg-midnight px-4 py-2 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {addComment.isPending ? "Posting…" : parentId ? "Reply" : "Comment"}
        </button>
      </div>
    </form>
  );
}
