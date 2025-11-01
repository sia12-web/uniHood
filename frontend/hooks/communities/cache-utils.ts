import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type {
  EventDetail,
  EventListResponse,
  EventSummary,
  FeedResponse,
  GroupPost,
  GroupPostsResponse,
} from "@/lib/communities";

function mapPages<T extends { items: GroupPost[] }>(
  data: InfiniteData<T> | undefined,
  postId: string,
  updater: (post: GroupPost) => GroupPost,
): InfiniteData<T> | undefined {
  if (!data) {
    return data;
  }
  return {
    pageParams: data.pageParams,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === postId ? updater(item) : item)),
    })),
  };
}

export function updatePostInCaches(queryClient: QueryClient, postId: string, updater: (post: GroupPost) => GroupPost) {
  const groupQueries = queryClient.getQueriesData<InfiniteData<GroupPostsResponse>>({ queryKey: ["groupPosts"] });
  groupQueries.forEach(([key, value]) => {
    if (!value) {
      return;
    }
    queryClient.setQueryData(key, mapPages(value, postId, updater));
  });

  const feedQueries = queryClient.getQueriesData<InfiniteData<FeedResponse>>({ queryKey: ["feed"] });
  feedQueries.forEach(([key, value]) => {
    if (!value) {
      return;
    }
    queryClient.setQueryData(key, mapPages(value, postId, updater));
  });

  const postQueryKey = ["post", postId] as const;
  const postData = queryClient.getQueryData<GroupPost>(postQueryKey);
  if (postData) {
    queryClient.setQueryData(postQueryKey, updater(postData));
  }
}

export function adjustPostCommentCount(queryClient: QueryClient, postId: string, delta: number) {
  updatePostInCaches(queryClient, postId, (post) => ({
    ...post,
    comments_count: Math.max(0, (post.comments_count ?? 0) + delta),
  }));
}

export function updatePostReactions(
  queryClient: QueryClient,
  postId: string,
  reactionsUpdater: (post: GroupPost) => GroupPost,
) {
  updatePostInCaches(queryClient, postId, reactionsUpdater);
}

function mapEventPages(
  data: InfiniteData<EventListResponse> | undefined,
  eventId: string,
  updater: (event: EventSummary) => EventSummary,
): InfiniteData<EventListResponse> | undefined {
  if (!data) {
    return data;
  }
  return {
    pageParams: data.pageParams,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === eventId ? updater(item) : item)),
    })),
  };
}

export function updateEventInCaches(
  queryClient: QueryClient,
  eventId: string,
  updater: (event: EventSummary) => EventSummary,
) {
  const globalQueries = queryClient.getQueriesData<InfiniteData<EventListResponse>>({ queryKey: ["eventsGlobal"] });
  globalQueries.forEach(([key, value]) => {
    if (!value) {
      return;
    }
    queryClient.setQueryData(key, mapEventPages(value, eventId, updater));
  });

  const groupQueries = queryClient.getQueriesData<InfiniteData<EventListResponse>>({ queryKey: ["eventsGroup"] });
  groupQueries.forEach(([key, value]) => {
    if (!value) {
      return;
    }
    queryClient.setQueryData(key, mapEventPages(value, eventId, updater));
  });

  const detailKey = ["event", eventId] as const;
  const detailData = queryClient.getQueryData<EventDetail>(detailKey);
  if (detailData) {
    const updated = updater(detailData);
    queryClient.setQueryData(detailKey, { ...detailData, ...updated });
  }
}

export function replaceEventDetail(queryClient: QueryClient, event: EventDetail) {
  const detailKey = ["event", event.id] as const;
  queryClient.setQueryData(detailKey, event);

  const summaryUpdater = (prev: EventSummary) => ({ ...prev, ...event });
  updateEventInCaches(queryClient, event.id, summaryUpdater);
}
