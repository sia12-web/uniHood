"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { CurrentUser } from "@/lib/auth-guard";
import { useFeed, type FeedScope } from "@/hooks/communities/use-feed";

import { EmptyState } from "../empty-state";
import { PostCardSkeleton } from "../group/skeletons";
import { PostCard } from "../group/post-card";

export type FeedViewProps = {
  scope: FeedScope;
  currentUser: CurrentUser;
  header?: string;
  description?: string;
};

export function FeedView({ scope, currentUser, header = "Community feed", description }: FeedViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  const query = useFeed(scope);
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetching, isLoading, isError, error } = query;
  const posts = query.posts;

  const count = useMemo(() => (hasNextPage ? posts.length + 1 : posts.length), [hasNextPage, posts.length]);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 360,
    overscan: 8,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.style.height = `${totalSize}px`;
    }
  }, [totalSize]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    if (virtualItems.length === 0) {
      return;
    }
    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem.index >= posts.length - 1) {
      fetchNextPage();
    }
  }, [virtualItems, fetchNextPage, hasNextPage, isFetchingNextPage, posts.length]);

  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{header}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto px-4 py-6">
        {isLoading && posts.length === 0 ? (
          <div className="space-y-4">
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">We couldn&apos;t load the feed.</p>
            <p>{error instanceof Error ? error.message : "Please try again."}</p>
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            title="No updates yet"
            description="Follow a few groups to see new posts, reactions, and comments stream in here."
          />
        ) : (
          <div ref={innerRef} className="relative">
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const isLoaderRow = virtualItem.index >= posts.length;
              const post = posts[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={(node) => {
                    virtualizer.measureElement(node);
                    if (node) {
                      node.style.position = "absolute";
                      node.style.top = "0";
                      node.style.left = "0";
                      node.style.width = "100%";
                      node.style.transform = `translateY(${virtualItem.start}px)`;
                    }
                  }}
                  className="w-full"
                >
                  {isLoaderRow ? (
                    <div className="py-6 text-center text-xs text-slate-500">Loading more…</div>
                  ) : (
                    <PostCard post={post} groupId={post.group_id} currentUser={currentUser} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {isFetching && !isFetchingNextPage ? (
        <div className="border-t border-slate-200 px-6 py-3 text-xs text-slate-500">Updating feed…</div>
      ) : null}
    </section>
  );
}
