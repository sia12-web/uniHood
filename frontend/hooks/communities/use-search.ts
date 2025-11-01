import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import {
  isRateLimitError,
  searchEvents,
  searchGroups,
  searchPosts,
  type EventSearchSource,
  type GroupSearchSource,
  type PostSearchSource,
  type SearchResponse,
  type SearchResultHit,
  type TypeaheadScope,
} from "@/lib/community-search";
import { canRunSearch, makeQueryHash, type NormalizedSearchParams, type SearchScope } from "@/utils/search";

export type CombinedSearchSource = GroupSearchSource | PostSearchSource | EventSearchSource;
export type CombinedSearchHit = SearchResultHit<CombinedSearchSource>;

type CombinedResponse = SearchResponse<CombinedSearchSource>;

type Fetcher = (options: { next?: string | null; signal?: AbortSignal }) => Promise<CombinedResponse>;

function createFetcher(scope: SearchScope, params: NormalizedSearchParams): Fetcher {
  if (scope === "groups") {
    return ({ next, signal }) =>
      searchGroups({
        q: params.q,
        campus_id: params.campus_id,
        time_from: params.time_from,
        time_to: params.time_to,
        size: params.size,
        next: next ?? null,
        signal,
      }) as Promise<CombinedResponse>;
  }
  if (scope === "posts") {
    return ({ next, signal }) =>
      searchPosts({
        q: params.q,
        campus_id: params.campus_id,
        time_from: params.time_from,
        time_to: params.time_to,
        size: params.size,
        tags: params.tags,
        next: next ?? null,
        signal,
      }) as Promise<CombinedResponse>;
  }
  return ({ next, signal }) =>
    searchEvents({
      q: params.q,
      campus_id: params.campus_id,
      time_from: params.time_from,
      time_to: params.time_to,
      size: params.size,
      next: next ?? null,
      signal,
    }) as Promise<CombinedResponse>;
}

function dedupeHits(pages: CombinedResponse[] | undefined): CombinedSearchHit[] {
  if (!pages) {
    return [];
  }
  const map = new Map<string, CombinedSearchHit>();
  pages.forEach((page) => {
    page.hits.forEach((hit) => {
      if (!map.has(hit._id)) {
        map.set(hit._id, hit as CombinedSearchHit);
      }
    });
  });
  return Array.from(map.values());
}

export function useSearch(scope: SearchScope, params: NormalizedSearchParams) {
  const hash = useMemo(() => makeQueryHash(params), [params]);
  const fetcher = useMemo(() => createFetcher(scope, params), [scope, params]);

  const query = useInfiniteQuery<CombinedResponse>({
    queryKey: ["search", scope, hash],
    enabled: canRunSearch(scope, params),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next ?? undefined,
    staleTime: 10_000,
    queryFn: ({ pageParam, signal }) => fetcher({ next: (pageParam as string | undefined) ?? null, signal }),
  });

  const hits = useMemo(() => dedupeHits(query.data?.pages), [query.data?.pages]);
  const took = useMemo(() => query.data?.pages?.[0]?.took_ms ?? null, [query.data?.pages]);
  const facets = useMemo(() => query.data?.pages?.[0]?.facets ?? null, [query.data?.pages]);

  const rateLimit = isRateLimitError(query.error) ? query.error : null;

  return {
    ...query,
    hits,
    took,
    facets,
    hash,
    isRateLimited: Boolean(rateLimit),
    retryAfter: rateLimit?.retryAfter,
  };
}

export function getTypeaheadScope(scope: SearchScope): TypeaheadScope {
  if (scope === "groups") {
    return "groups";
  }
  if (scope === "posts") {
    return "posts";
  }
  return "events";
}
