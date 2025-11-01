import { useMemo } from "react";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";

import { listGroupFeed, listUserFeed, type FeedResponse, type GroupPost } from "@/lib/communities";

import { useKeyset } from "./use-keyset";

export type FeedScope = { type: "user" } | { type: "group"; groupId: string };

export function feedQueryKey(scope: FeedScope) {
  return ["feed", scope] as const;
}

export function useFeed(scope: FeedScope) {
  const { getNextPageParam, flattenPages } = useKeyset<GroupPost>();

  const query = useInfiniteQuery<FeedResponse>({
    queryKey: feedQueryKey(scope),
    queryFn: ({ pageParam }) =>
      scope.type === "user"
        ? listUserFeed({ after: (pageParam as string | undefined) ?? null, limit: 20 })
        : listGroupFeed(scope.groupId, { after: (pageParam as string | undefined) ?? null, limit: 20 }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 10_000,
    initialPageParam: undefined,
  });

  const posts = useMemo(() => {
    const items = flattenPages(query.data?.pages);
    const deduped = new Map<string, GroupPost>();
    items.forEach((item) => {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, item);
      }
    });
    return Array.from(deduped.values());
  }, [flattenPages, query.data]);

  return {
    ...query,
    posts,
  };
}
