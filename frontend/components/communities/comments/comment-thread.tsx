"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useCommentSocketBridge, useComments } from "@/hooks/communities/use-comments";
import type { CurrentUser } from "@/lib/auth-guard";
import type { CommentListResponse, PostComment } from "@/lib/communities";
import { usePresence } from "@/hooks/presence/use-presence";
import { useTyping } from "@/hooks/presence/use-typing";
import TypingDots from "@/components/TypingDots";

import { CommentComposer } from "./comment-composer";
import { CommentItem } from "./comment-item";

export type CommentThreadProps = {
  postId: string;
  currentUser: CurrentUser;
};

function flattenComments(pages: CommentListResponse[] | undefined): PostComment[] {
  if (!pages) {
    return [];
  }
  return pages.flatMap((page) => page.items);
}

export function CommentThread({ postId, currentUser }: CommentThreadProps) {
  useCommentSocketBridge(postId);
  const query = useComments(postId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  const comments = useMemo(() => flattenComments(query.data?.pages), [query.data?.pages]);
  const authorIds = useMemo(
    () =>
      comments
        .map((comment) => comment.author?.id)
        .filter((id): id is string => Boolean(id)),
    [comments],
  );
  const { presence: presenceMap } = usePresence(authorIds);
  const { typingUsers, startTyping, stopTyping } = useTyping({ scope: "post", id: postId, currentUserId: currentUser.id });

  const virtualizer = useVirtualizer({
    count: comments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 6,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const totalSize = virtualizer.getTotalSize();

  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.style.height = `${totalSize}px`;
    }
  }, [totalSize]);

  useEffect(() => stopTyping, [stopTyping]);

  return (
    <section className="space-y-4" aria-label="Post discussion">
      <CommentComposer
        postId={postId}
        currentUser={currentUser}
        placeholder="Share your perspective"
        onTypingStart={startTyping}
        onTypingStop={stopTyping}
      />

      {typingUsers.length > 0 ? (
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          {typingUsers.length === 1 ? "Someone is typing…" : `${typingUsers.length} people are typing…`}
          <TypingDots active />
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div ref={scrollRef} className="max-h-[28rem] overflow-y-auto p-3">
          {query.isLoading ? (
            <div className="space-y-3 text-sm text-slate-500">
              <p>Loading comments…</p>
              <p className="text-xs text-slate-400">Hang tight — we&apos;re pulling the latest thread.</p>
            </div>
          ) : query.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">We couldn&apos;t load the comments.</p>
              <p>{query.error instanceof Error ? query.error.message : "Please try again."}</p>
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-slate-600">No comments yet. Start the conversation above.</p>
          ) : (
            <div ref={innerRef} className="relative">
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const comment = comments[virtualItem.index];
                return (
                  <div
                    key={comment.id}
                    data-index={virtualItem.index}
                    ref={(node) => {
                      virtualizer.measureElement(node);
                      if (node) {
                        node.style.position = "absolute";
                        node.style.top = "0";
                        node.style.left = "0";
                        node.style.width = "100%";
                        node.style.right = "0";
                        node.style.transform = `translateY(${virtualItem.start}px)`;
                      }
                    }}
                    className="w-full"
                  >
                    <CommentItem
                      comment={comment}
                      postId={postId}
                      currentUser={currentUser}
                      level={0}
                      presence={comment.author?.id ? presenceMap[comment.author.id] ?? null : null}
                      onTypingStart={startTyping}
                      onTypingStop={stopTyping}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {query.hasNextPage ? (
          <div className="border-t border-slate-200 p-3 text-center">
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-midnight hover:text-midnight disabled:cursor-not-allowed disabled:opacity-70"
            >
              {query.isFetchingNextPage ? "Loading more…" : "Load older comments"}
            </button>
          </div>
        ) : null}
      </div>
      {query.isFetching && !query.isFetchingNextPage ? (
        <p className="text-xs text-slate-400">Updating…</p>
      ) : null}
    </section>
  );
}
