const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.API_BASE_URL ??
  (typeof window === "undefined" ? `http://localhost:${process.env.PORT ?? "3000"}` : "");
const DEFAULT_HEADERS: Record<string, string> = { "Content-Type": "application/json" };

const STUB_ENABLED = process.env.NEXT_PUBLIC_COMMUNITIES_STUB === "1";
const NOW = new Date().toISOString();
const STUB_GROUPS = [
  {
    id: "stub-campus-creators",
    name: "Campus Creators",
    slug: "campus-creators",
    description: "Ship rapid prototypes with fellow makers across campus.",
    visibility: "public" as const,
    tags: ["makers", "design"],
    campus_id: null,
    avatar_key: null,
    cover_key: null,
    is_locked: false,
    created_by: "stub-user-1",
    created_at: NOW,
    updated_at: NOW,
    role: null,
  },
  {
    id: "stub-campus-mentors",
    name: "Campus Mentors Collective",
    slug: "campus-mentors",
    description: "Swap feedback quickly, share resources, and match mentees in minutes.",
    visibility: "public" as const,
    tags: ["mentorship", "career"],
    campus_id: null,
    avatar_key: null,
    cover_key: null,
    is_locked: false,
    created_by: "stub-user-2",
    created_at: NOW,
    updated_at: NOW,
    role: null,
  },
];

const STUB_GROUP_MEMBERS: Record<string, Array<{
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  role: string | null;
  joined_at: string | null;
}>> = {
  "stub-campus-creators": [
    {
      id: "stub-user-1",
      display_name: "Skylar Reed",
      handle: "skylar",
      avatar_url: null,
      role: "Organizer",
      joined_at: NOW,
    },
    {
      id: "stub-user-3",
      display_name: "Avery Chen",
      handle: "avery",
      avatar_url: null,
      role: "Moderator",
      joined_at: NOW,
    },
    {
      id: "stub-user-4",
      display_name: "Morgan Patel",
      handle: "morganp",
      avatar_url: null,
      role: "Member",
      joined_at: NOW,
    },
    {
      id: "stub-user-7",
      display_name: "Taylor Gomez",
      handle: "taygo",
      avatar_url: null,
      role: "Member",
      joined_at: NOW,
    },
  ],
  "stub-campus-mentors": [
    {
      id: "stub-user-5",
      display_name: "Jordan Blake",
      handle: "jordan",
      avatar_url: null,
      role: "Lead mentor",
      joined_at: NOW,
    },
    {
      id: "stub-user-6",
      display_name: "Parker Mills",
      handle: "parkerm",
      avatar_url: null,
      role: "Mentor",
      joined_at: NOW,
    },
    {
      id: "stub-user-8",
      display_name: "Riley Singh",
      handle: "rileys",
      avatar_url: null,
      role: "Mentor",
      joined_at: NOW,
    },
    {
      id: "stub-user-9",
      display_name: "Casey Brooks",
      handle: "casey",
      avatar_url: null,
      role: "Member",
      joined_at: NOW,
    },
  ],
};

function resolveUrl(path: string): string {
  if (!API_BASE) {
    return path;
  }
  return path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type CommunityVisibility = "public" | "private" | "secret";

export type CommunityGroup = {
  id: string;
  name: string;
  slug: string;
  description: string;
  visibility: CommunityVisibility;
  tags: string[];
  campus_id: string | null;
  avatar_key: string | null;
  cover_key: string | null;
  is_locked: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  role: string | null;
};

export type GroupPostAttachment = {
  id: string;
  s3_key: string;
  url?: string | null;
  mime: string;
  size_bytes: number;
  width?: number | null;
  height?: number | null;
};

export type GroupPostAuthor = {
  id: string;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
};

export type GroupMember = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  role: string | null;
  joined_at?: string | null;
};

export type GroupMembersResponse = {
  items: GroupMember[];
  next_cursor?: string | null;
};

export type ReactionSummary = {
  emoji: string;
  count: number;
  viewer_has_reacted: boolean;
};

export type GroupPost = {
  id: string;
  group_id: string;
  title?: string | null;
  body: string;
  topic_tags: string[];
  attachments: GroupPostAttachment[];
  author: GroupPostAuthor;
  created_at: string;
  updated_at: string;
  pinned_at?: string | null;
  editable?: boolean;
  deletable?: boolean;
  reactions: ReactionSummary[];
  comments_count: number;
};

const STUB_POSTS: Record<string, GroupPost[]> = {
  "stub-campus-creators": [
    {
      id: "stub-post-creators-1",
      group_id: "stub-campus-creators",
      title: "Build night kickoff",
      body: "Grab your soldering irons. We're prototyping wearable badges tonight at 7pm.",
      topic_tags: ["hardware", "events"],
      attachments: [],
      author: {
        id: "stub-user-1",
        display_name: "Skylar",
        handle: "skylar",
        avatar_url: null,
      },
      created_at: NOW,
      updated_at: NOW,
      pinned_at: null,
      editable: true,
      deletable: true,
      reactions: [
        { emoji: "👍", count: 6, viewer_has_reacted: false },
        { emoji: "🎉", count: 3, viewer_has_reacted: true },
      ],
      comments_count: 2,
    },
  ],
};

export type CommentReaction = ReactionSummary;

export type PostComment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  depth: number;
  author: GroupPostAuthor;
  created_at: string;
  updated_at: string;
  reactions: CommentReaction[];
  replies_count: number;
  can_edit: boolean;
  can_delete: boolean;
  is_deleted?: boolean;
};

export type CommentListResponse = {
  items: PostComment[];
  next_cursor?: string | null;
};

export type FeedResponse = {
  items: GroupPost[];
  next_cursor?: string | null;
};

export type EventVenuePhysical = {
  kind: "physical";
  name?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  timezone?: string | null;
  map_url?: string | null;
};

export type EventVenueVirtual = {
  kind: "virtual";
  url: string;
  platform?: string | null;
  timezone?: string | null;
};

export type EventVenue = EventVenuePhysical | EventVenueVirtual;

export type EventAttendee = {
  id: string;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
};

export type EventRsvpStatus = "going" | "interested" | "declined" | "waitlist" | "none";

export type EventSummary = {
  id: string;
  group_id: string;
  group_name: string;
  group_slug?: string | null;
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
  all_day: boolean;
  venue: EventVenue;
  allow_guests: boolean;
  guests_max?: number | null;
  capacity?: number | null;
  going_count: number;
  interested_count: number;
  waitlist_count: number;
  my_status?: EventRsvpStatus | null;
  my_guests?: number | null;
  tags?: string[] | null;
  status: "scheduled" | "cancelled" | "completed";
  cover_image_url?: string | null;
  created_at: string;
  updated_at: string;
};

export type EventDetail = EventSummary & {
  description?: string | null;
  attendees_preview: EventAttendee[];
  waitlist_enabled: boolean;
  rsvp_closes_at?: string | null;
  rsvp_open?: boolean;
};

export type EventListResponse = {
  items: EventSummary[];
  next_cursor?: string | null;
};

const STUB_EVENTS: Record<string, EventDetail> = {
  "stub-event-1": {
    id: "stub-event-1",
    group_id: "stub-campus-creators",
    group_name: "Campus Creators",
    group_slug: "campus-creators",
    title: "Wearable Build Night",
    description: "Bring your soldering iron and prototype with the crew.",
    start_at: NOW,
    end_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    timezone: "UTC",
    all_day: false,
    venue: {
      kind: "physical",
      address_line1: "Innovation Lab",
      city: "San Francisco",
      state: "CA",
      country: "USA",
      timezone: "America/Los_Angeles",
      map_url: "https://maps.example.com/lab",
    },
    allow_guests: true,
    guests_max: 2,
    capacity: 40,
    going_count: 12,
    interested_count: 6,
    waitlist_count: 1,
    my_status: "interested",
    my_guests: 0,
  tags: ["hardware", "design"],
    status: "scheduled",
    cover_image_url: null,
    created_at: NOW,
    updated_at: NOW,
    attendees_preview: [
      { id: "stub-user-1", display_name: "Skylar", handle: "skylar" },
      { id: "stub-user-2", display_name: "Quinn", handle: "quinn" },
    ],
    waitlist_enabled: true,
    rsvp_closes_at: null,
    rsvp_open: true,
  },
  "stub-event-2": {
    id: "stub-event-2",
    group_id: "stub-campus-mentors",
    group_name: "Campus Mentors Collective",
    group_slug: "campus-mentors",
    title: "Mentor Roundtable",
    description: "Speed mentoring session with breakout topics.",
    start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    end_at: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    timezone: "UTC",
    all_day: false,
    venue: {
      kind: "virtual",
      url: "https://example.com/meet",
      platform: "Zoom",
      timezone: "America/New_York",
    },
    allow_guests: false,
    guests_max: 0,
    capacity: 100,
    going_count: 54,
    interested_count: 18,
    waitlist_count: 0,
    my_status: "going",
    my_guests: 0,
  tags: ["mentorship"],
    status: "scheduled",
    cover_image_url: null,
    created_at: NOW,
    updated_at: NOW,
    attendees_preview: [
      { id: "stub-user-3", display_name: "Riley", handle: "riley" },
    ],
    waitlist_enabled: true,
    rsvp_closes_at: null,
    rsvp_open: true,
  },
};

function listStubEvents(groupId?: string): EventSummary[] {
  const items = Object.values(STUB_EVENTS).filter((event) => (groupId ? event.group_id === groupId : true));
  return items
    .slice()
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .map((event) => ({ ...event }));
}

export async function listEvents(params?: { scope?: "upcoming" | "past" | "all"; limit?: number; after?: string | null }): Promise<EventListResponse> {
  if (STUB_ENABLED) {
    const items = listStubEvents();
    return { items: params?.limit ? items.slice(0, params.limit) : items };
  }
  const search = new URLSearchParams();
  if (params?.scope) {
    search.set("scope", params.scope);
  }
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params?.after) {
    search.set("after", params.after);
  }
  const suffix = search.toString();
  const path = suffix ? `/api/communities/v1/events?${suffix}` : "/api/communities/v1/events";
  return apiFetch<EventListResponse>(path, { method: "GET" });
}

export async function listGroupEvents(groupId: string, params?: { scope?: "upcoming" | "past" | "all"; limit?: number; after?: string | null }): Promise<EventListResponse> {
  if (STUB_ENABLED) {
    const items = listStubEvents(groupId);
    return { items: params?.limit ? items.slice(0, params.limit) : items };
  }
  const search = new URLSearchParams();
  if (params?.scope) {
    search.set("scope", params.scope);
  }
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params?.after) {
    search.set("after", params.after);
  }
  const suffix = search.toString();
  const path = suffix
    ? `/api/communities/v1/groups/${groupId}/events?${suffix}`
    : `/api/communities/v1/groups/${groupId}/events`;
  return apiFetch<EventListResponse>(path, { method: "GET" });
}

export async function getEvent(eventId: string): Promise<EventDetail> {
  if (STUB_ENABLED) {
    const event = STUB_EVENTS[eventId];
    if (!event) {
      throw new Error("event not found");
    }
    return { ...event };
  }
  return apiFetch<EventDetail>(`/api/communities/v1/events/${eventId}`, { method: "GET" });
}

export async function submitEventRsvp(
  eventId: string,
  body: { status: "going" | "interested" | "declined"; guests?: number },
): Promise<EventDetail> {
  if (STUB_ENABLED) {
    const event = STUB_EVENTS[eventId];
    if (!event) {
      throw new Error("event not found");
    }
    event.my_status = body.status;
    event.my_guests = body.guests ?? 0;
    if (body.status === "going") {
      const capacity = event.capacity ?? Number.POSITIVE_INFINITY;
      event.going_count = Math.min(capacity, event.going_count + 1);
    }
    if (body.status === "declined") {
      event.going_count = Math.max(0, event.going_count - 1);
    }
    event.updated_at = new Date().toISOString();
    return { ...event };
  }
  return apiFetch<EventDetail>(`/api/communities/v1/events/${eventId}/rsvps`, {
    method: "POST",
    body: JSON.stringify({
      status: body.status,
      guests: body.guests,
    }),
  });
}

export async function downloadEventIcs(eventId: string): Promise<Blob> {
  if (STUB_ENABLED) {
    const event = STUB_EVENTS[eventId];
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Divan//Communities//EN",
      "BEGIN:VEVENT",
      `UID:${eventId}@divan.stub`,
      `DTSTAMP:${NOW.replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${event?.start_at.replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTEND:${event?.end_at.replace(/[-:]/g, "").split(".")[0]}Z`,
      `SUMMARY:${event?.title ?? "Event"}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    return new Blob([content], { type: "text/calendar" });
  }
  const response = await fetch(resolveUrl(`/api/communities/v1/events/${eventId}/ics`), {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Unable to download ICS: ${response.status}`);
  }
  return response.blob();
}

export type GroupPostsResponse = {
  items: GroupPost[];
  next_cursor?: string | null;
};

export type PresignRequest = {
  mime: string;
  size_bytes: number;
  purpose: "post" | "comment";
};

export type PresignResponse = {
  url: string;
  key: string;
  fields?: Record<string, string>;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
};

export type AttachmentLinkRequest = {
  subject_type: "post";
  subject_id: string;
  s3_key: string;
  mime: string;
  size_bytes: number;
  width?: number | null;
  height?: number | null;
};

export type TagSearchResponse = {
  tags: string[];
};

export type CommunityListResponse = {
  items: CommunityGroup[];
};

export async function listGroups(params?: { limit?: number; offset?: number }): Promise<CommunityGroup[]> {
  if (STUB_ENABLED) {
    const start = params?.offset ?? 0;
    const end = params?.limit !== undefined ? start + params.limit : undefined;
    return STUB_GROUPS.slice(start, end);
  }
  const search = new URLSearchParams();
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params?.offset !== undefined) {
    search.set("offset", String(params.offset));
  }
  const suffix = search.toString();
  const path = suffix ? `/api/communities/v1/groups?${suffix}` : "/api/communities/v1/groups";
  try {
    const data = await apiFetch<CommunityListResponse>(path, { method: "GET" });
    return data.items;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("communities.listGroups failed", error);
    }
    return [];
  }
}

export async function getGroup(groupId: string): Promise<CommunityGroup> {
  if (STUB_ENABLED) {
    const matching = STUB_GROUPS.find((group) => group.id === groupId || group.slug === groupId);
    if (!matching) {
      throw new Error("group not found");
    }
    return matching;
  }
  return apiFetch<CommunityGroup>(`/api/communities/v1/groups/${groupId}`, { method: "GET" });
}

export async function listGroupMembers(groupId: string, params?: { limit?: number; cursor?: string | null }): Promise<GroupMembersResponse> {
  if (STUB_ENABLED) {
    const members = STUB_GROUP_MEMBERS[groupId] ?? [];
    const limit = params?.limit ?? members.length;
    return {
      items: members.slice(0, limit),
      next_cursor: null,
    };
  }
  const search = new URLSearchParams();
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params?.cursor) {
    search.set("cursor", params.cursor);
  }
  const suffix = search.toString();
  const path = suffix
    ? `/api/communities/v1/groups/${groupId}/members?${suffix}`
    : `/api/communities/v1/groups/${groupId}/members`;
  return apiFetch<GroupMembersResponse>(path, { method: "GET" });
}

export async function listGroupPosts(groupId: string, params?: { limit?: number; before?: string }): Promise<GroupPostsResponse> {
  if (STUB_ENABLED) {
    const posts = STUB_POSTS[groupId] ?? [];
    return { items: posts.slice(0, params?.limit ?? posts.length) };
  }
  const search = new URLSearchParams();
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params?.before) {
    search.set("before", params.before);
  }
  const suffix = search.toString();
  const path = suffix
    ? `/api/communities/v1/groups/${groupId}/posts?${suffix}`
    : `/api/communities/v1/groups/${groupId}/posts`;
  return apiFetch<GroupPostsResponse>(path, { method: "GET" });
}

export async function createGroupPost(groupId: string, body: { title?: string | null; body: string; topic_tags?: string[] | null }): Promise<GroupPost> {
  if (STUB_ENABLED) {
    const id = `stub-post-${Math.random().toString(36).slice(2)}`;
    const post: GroupPost = {
      id,
      group_id: groupId,
      title: body.title ?? null,
      body: body.body,
      topic_tags: body.topic_tags ?? [],
      attachments: [],
      author: {
        id: "stub-user-1",
        display_name: "Skylar",
        handle: "skylar",
        avatar_url: null,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pinned_at: null,
      editable: true,
      deletable: true,
      reactions: [],
      comments_count: 0,
    };
    STUB_POSTS[groupId] = [post, ...(STUB_POSTS[groupId] ?? [])];
    return post;
  }
  return apiFetch<GroupPost>(`/api/communities/v1/groups/${groupId}/posts`, {
    method: "POST",
    body: JSON.stringify({
      title: body.title ?? undefined,
      body: body.body,
      topic_tags: body.topic_tags ?? undefined,
    }),
  });
}

export async function updateGroupPost(postId: string, body: { title?: string | null; body?: string | null; topic_tags?: string[] | null }): Promise<GroupPost> {
  if (STUB_ENABLED) {
    const post = Object.values(STUB_POSTS)
      .flat()
      .find((item) => item.id === postId);
    if (!post) {
      throw new Error("post not found");
    }
    if (body.title !== undefined) {
      post.title = body.title;
    }
    if (body.body !== undefined && body.body !== null) {
      post.body = body.body;
    }
    if (body.topic_tags) {
      post.topic_tags = body.topic_tags;
    }
    post.updated_at = new Date().toISOString();
    return post;
  }
  return apiFetch<GroupPost>(`/api/communities/v1/posts/${postId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: body.title ?? undefined,
      body: body.body ?? undefined,
      topic_tags: body.topic_tags ?? undefined,
    }),
  });
}

export async function deleteGroupPost(postId: string): Promise<void> {
  if (STUB_ENABLED) {
    for (const key of Object.keys(STUB_POSTS)) {
      STUB_POSTS[key] = (STUB_POSTS[key] ?? []).filter((post) => post.id !== postId);
    }
    return;
  }
  await apiFetch(`/api/communities/v1/posts/${postId}`, { method: "DELETE" });
}

export async function presignUpload(input: PresignRequest): Promise<PresignResponse> {
  if (STUB_ENABLED) {
    return {
      url: "https://example.com/upload",
      key: `stub/${Math.random().toString(36).slice(2)}`,
    };
  }
  return apiFetch<PresignResponse>(`/api/communities/v1/uploads/presign`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function linkAttachment(input: AttachmentLinkRequest): Promise<void> {
  if (STUB_ENABLED) {
    return;
  }
  await apiFetch(`/api/communities/v1/attachments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function searchTags(query: string): Promise<TagSearchResponse> {
  if (STUB_ENABLED) {
    const allTags = ["events", "hardware", "design", "mentorship", "career", "hackathon"];
    const tags = allTags.filter((tag) => tag.toLowerCase().startsWith(query.toLowerCase()));
    return { tags };
  }
  const search = new URLSearchParams();
  search.set("query", query);
  return apiFetch<TagSearchResponse>(`/api/communities/v1/tags?${search.toString()}`, { method: "GET" });
}

export async function getPost(postId: string): Promise<GroupPost> {
  if (STUB_ENABLED) {
    const post = Object.values(STUB_POSTS)
      .flat()
      .find((item) => item.id === postId);
    if (!post) {
      throw new Error("post not found");
    }
    return post;
  }
  return apiFetch<GroupPost>(`/api/communities/v1/posts/${postId}`, { method: "GET" });
}

export async function listComments(postId: string, params?: { parent_id?: string | null; after?: string | null; limit?: number }): Promise<CommentListResponse> {
  if (STUB_ENABLED) {
    const comments: PostComment[] = [
      {
        id: "stub-comment-1",
        post_id: postId,
        parent_id: null,
        body: "Super excited for this!",
        depth: 0,
        author: {
          id: "stub-user-2",
          display_name: "Avery",
          handle: "avery",
          avatar_url: null,
        },
        created_at: NOW,
        updated_at: NOW,
        reactions: [{ emoji: "🎉", count: 1, viewer_has_reacted: false }],
        replies_count: 1,
        can_edit: false,
        can_delete: false,
      },
    ];
    return { items: params?.parent_id ? [] : comments };
  }
  const search = new URLSearchParams();
  if (params?.parent_id) {
    search.set("parent_id", params.parent_id);
  }
  if (params?.after) {
    search.set("after", params.after);
  }
  if (params?.limit) {
    search.set("limit", String(params.limit));
  }
  const suffix = search.toString();
  const path = suffix
    ? `/api/communities/v1/posts/${postId}/comments?${suffix}`
    : `/api/communities/v1/posts/${postId}/comments`;
  return apiFetch<CommentListResponse>(path, { method: "GET" });
}

export async function createComment(postId: string, body: { body: string; parent_id?: string | null }): Promise<PostComment> {
  if (STUB_ENABLED) {
    return {
      id: `stub-comment-${Math.random().toString(36).slice(2)}`,
      post_id: postId,
      parent_id: body.parent_id ?? null,
      body: body.body,
      depth: body.parent_id ? 1 : 0,
      author: {
        id: "stub-user-1",
        display_name: "Skylar",
        handle: "skylar",
        avatar_url: null,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      reactions: [],
      replies_count: 0,
      can_edit: true,
      can_delete: true,
    };
  }
  return apiFetch<PostComment>(`/api/communities/v1/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateComment(commentId: string, body: { body: string }): Promise<PostComment> {
  if (STUB_ENABLED) {
    return {
      id: commentId,
      post_id: "stub",
      parent_id: null,
      body: body.body,
      depth: 0,
      author: {
        id: "stub-user-1",
        display_name: "Skylar",
        handle: "skylar",
        avatar_url: null,
      },
      created_at: NOW,
      updated_at: new Date().toISOString(),
      reactions: [],
      replies_count: 0,
      can_edit: true,
      can_delete: true,
    };
  }
  return apiFetch<PostComment>(`/api/communities/v1/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteComment(commentId: string): Promise<void> {
  if (STUB_ENABLED) {
    return;
  }
  await apiFetch(`/api/communities/v1/comments/${commentId}`, { method: "DELETE" });
}

export async function createReaction(input: { subject_type: "post" | "comment"; subject_id: string; emoji: string }): Promise<void> {
  if (STUB_ENABLED) {
    return;
  }
  await apiFetch(`/api/communities/v1/reactions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteReaction(input: { subject_type: "post" | "comment"; subject_id: string; emoji: string }): Promise<void> {
  if (STUB_ENABLED) {
    return;
  }
  const search = new URLSearchParams();
  search.set("subject_type", input.subject_type);
  search.set("subject_id", input.subject_id);
  search.set("emoji", input.emoji);
  await apiFetch(`/api/communities/v1/reactions?${search.toString()}`, {
    method: "DELETE",
  });
}

export async function listUserFeed(params?: { after?: string | null; limit?: number }): Promise<FeedResponse> {
  if (STUB_ENABLED) {
    return { items: Object.values(STUB_POSTS).flat(), next_cursor: null };
  }
  const search = new URLSearchParams();
  if (params?.after) {
    search.set("after", params.after);
  }
  if (params?.limit) {
    search.set("limit", String(params.limit));
  }
  const suffix = search.toString();
  const path = suffix ? `/api/communities/v1/feeds/user?${suffix}` : `/api/communities/v1/feeds/user`;
  return apiFetch<FeedResponse>(path, { method: "GET" });
}

export async function listGroupFeed(groupId: string, params?: { after?: string | null; limit?: number }): Promise<FeedResponse> {
  if (STUB_ENABLED) {
    return { items: STUB_POSTS[groupId] ?? [], next_cursor: null };
  }
  const search = new URLSearchParams();
  if (params?.after) {
    search.set("after", params.after);
  }
  if (params?.limit) {
    search.set("limit", String(params.limit));
  }
  const suffix = search.toString();
  const path = suffix
    ? `/api/communities/v1/feeds/group/${groupId}?${suffix}`
    : `/api/communities/v1/feeds/group/${groupId}`;
  return apiFetch<FeedResponse>(path, { method: "GET" });
}
