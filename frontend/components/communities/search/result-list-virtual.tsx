"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { CombinedSearchHit } from "@/hooks/communities/use-search";

export type ResultListVirtualProps = {
  hits: CombinedSearchHit[];
  estimateHeight?: number;
  hasNextPage: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  onLoadMore(): void;
  emptyState?: React.ReactNode;
  renderHit(hit: CombinedSearchHit): React.ReactNode;
};

export function ResultListVirtual({
  hits,
  estimateHeight = 180,
  hasNextPage,
  isLoading,
  isFetchingNextPage,
  onLoadMore,
  emptyState,
  renderHit,
}: ResultListVirtualProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const count = useMemo(() => hits.length + (hasNextPage ? 1 : 0), [hasNextPage, hits.length]);

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateHeight,
    overscan: 6,
  });

  const totalSize = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

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
    const last = virtualItems[virtualItems.length - 1];
    if (last.index >= hits.length - 1) {
      onLoadMore();
    }
  }, [virtualItems, hasNextPage, isFetchingNextPage, hits.length, onLoadMore]);

  if (isLoading && hits.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">
        Searching…
      </div>
    );
  }

  if (!isLoading && hits.length === 0 && !hasNextPage) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">
        {emptyState ?? "No results yet. Try a different query."}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-[600px] overflow-y-auto">
      <div ref={innerRef} className="relative w-full">
        {virtualItems.map((item) => {
          const hit = hits[item.index];
          const isLoader = item.index >= hits.length || !hit;
          return (
            <div
              key={item.key}
              data-index={item.index}
              className="p-2"
              ref={(node) => {
                if (node) {
                  rowVirtualizer.measureElement(node);
                  node.style.position = "absolute";
                  node.style.top = "0";
                  node.style.left = "0";
                  node.style.width = "100%";
                  node.style.transform = `translateY(${item.start}px)`;
                }
              }}
            >
              {isLoader ? (
                <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">
                  {isFetchingNextPage ? "Loading more…" : "Load more"}
                </div>
              ) : (
                renderHit(hit)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
