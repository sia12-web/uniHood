
"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

import BrandLogo from "@/components/BrandLogo";
import HomeProximityPreview from "@/components/HomeProximityPreview";
import { useTypingDuelInviteState } from "@/components/providers/typing-duel-invite-provider";
import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";
import { useInviteInboxCount } from "@/hooks/social/use-invite-count";
import { useChatUnreadIndicator } from "@/hooks/chat/use-chat-unread-indicator";
import { useChatRoster } from "@/hooks/chat/use-chat-roster";
import { clearAuthSnapshot, onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { getBackendUrl } from "@/lib/env";

const iconClassName = "h-4 w-4 flex-none";

const DashboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 13h6v7H4zM14 4h6v16h-6zM4 4h6v7H4zM14 13h6" />
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 13h8M8 9h8" />
  </svg>
);

const ActivityIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l2-7 4 18 3-11h6" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Zm7.94-2.78a1 1 0 0 0 .2-1.09l-1.08-2.36a1 1 0 0 1 .12-.97l1.54-2.3a1 1 0 0 0-.17-1.3l-1.73-1.73a1 1 0 0 0-1.3-.17l-2.3 1.54a1 1 0 0 1-.97.12L13.37 2.86a1 1 0 0 0-1.09-.2l-2.48.9a1 1 0 0 0-.63.82l-.28 2.7a1 1 0 0 1-.63.82l-2.36 1.08a1 1 0 0 0-.58.91v2.45a1 1 0 0 0 .58.91l2.36 1.08a1 1 0 0 1 .63.82l.28 2.7a1 1 0 0 0 .63.82l2.48.9a1 1 0 0 0 1.09-.2l2.36-2.14a1 1 0 0 1 .97-.12l2.3 1.54a1 1 0 0 0 1.3-.17l1.73-1.73a1 1 0 0 0 .17-1.3l-1.54-2.3a1 1 0 0 1-.12-.97Z"
    />
  </svg>
);
const ProfileSettingsInline = dynamic(
	() => import("@/app/(identity)/settings/profile/page").then((mod) => mod.default),
	{
		ssr: false,
		loading: () => (
			<div className="rounded-3xl border border-slate-200 bg-white/90 p-6 text-sm text-slate-600 shadow-sm">
				Loading settings...
			</div>
		),
	},
);

const activityPreviews = [
  {
    title: "Speed Typing Duel",
    description: "Race head-to-head to finish the sample with accuracy.",
    href: "/activities/speed_typing",
    badge: "Live duel",
    gradient: "from-[#0f2336] via-[#0a3c5a] to-[#0b1a2c]",
    accent: "bg-gradient-to-r from-[#21d4fd] to-[#b721ff]",
  },
  {
    title: "Quick Trivia",
    description: "Rapid questions. Earn points for correctness and speed.",
    href: "/activities/quick_trivia",
    badge: "PvP",
    gradient: "from-[#1a1435] via-[#251d5c] to-[#0f0e2a]",
    accent: "bg-gradient-to-r from-[#6d8dff] via-[#a177ff] to-[#f48fb1]",
  },
  {
    title: "Rock / Paper / Scissors",
    description: "Real-time duel game used in earlier calibration labs.",
    href: "/activities/rock_paper_scissors",
    badge: "Classic",
    gradient: "from-[#1c1f35] via-[#2d3456] to-[#161a2e]",
    accent: "bg-gradient-to-r from-[#7cf5ff] via-[#7ba0ff] to-[#f7b2ff]",
  },
];

type FriendPreview = {
  name: string;
  detail: string;
  status: string;
  major: string;
  year: "freshman" | "sophomore" | "junior" | "senior" | "grad";
  campus: string;
  avatarColor: string;
  imageUrl?: string | null;
  distance?: number | null;
  gallery?: string[] | null;
};

const FRIEND_PREVIEW_DATA: FriendPreview[] = [
	{ name: "Amina Kadri", detail: "Met in Econ 201 - Last chat 2h ago", status: "Online", major: "Economics", year: "freshman", campus: "North", avatarColor: "from-rose-300 via-amber-200 to-emerald-200" },
	{ name: "Leo Martinez", detail: "Library study buddy - Last chat yesterday", status: "Away", major: "Computer Science", year: "senior", campus: "Central", avatarColor: "from-indigo-300 via-sky-200 to-emerald-200" },
	{ name: "Priya N.", detail: "Studio partner - New connection", status: "Online", major: "Design", year: "sophomore", campus: "Arts", avatarColor: "from-amber-200 via-rose-200 to-blue-200" },
	{ name: "Noah Greene", detail: "Capstone teammate - Pinged today", status: "Online", major: "Business", year: "senior", campus: "North", avatarColor: "from-emerald-200 via-teal-200 to-cyan-200" },
	{ name: "Sara O.", detail: "Orientation buddy - New invite", status: "Away", major: "Biology", year: "freshman", campus: "Central", avatarColor: "from-purple-200 via-rose-200 to-amber-200" },
];

type ChatPreview = {
	name: string;
	handle: string;
	snippet: string;
	time: string;
	status: "online" | "away";
	unread?: number;
	accent: string;
};

const CHAT_ACCENTS = [
	"from-rose-200 via-amber-100 to-white",
	"from-sky-200 via-blue-100 to-white",
	"from-amber-200 via-rose-100 to-white",
	"from-emerald-200 via-teal-100 to-white",
];

function formatChatTime(iso: string | null | undefined): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);
	if (diffMinutes < 1) return "Just now";
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type NavKey = "dashboard" | "friends" | "chats" | "activities" | "settings";
export default function HomePage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [activeSection, setActiveSection] = useState<NavKey>("dashboard");
  const majorFilterId = useId();
  const yearFilterId = useId();
  const campusFilterId = useId();
  const rangeFilterId = useId();
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [draftMajorFilter, setDraftMajorFilter] = useState<string | "all">("all");
  const [draftYearFilter, setDraftYearFilter] = useState<FriendPreview["year"] | "all">("all");
  const [draftUniversityFilter, setDraftUniversityFilter] = useState<string | "all">("all");
  const [draftRangeFilter, setDraftRangeFilter] = useState<"all" | "20" | "50" | "100" | "200">("all");
  const [selectedYearFilter, setSelectedYearFilter] = useState<FriendPreview["year"] | "all">("all");
  const [selectedMajorFilter, setSelectedMajorFilter] = useState<string | "all">("all");
  const [selectedUniversityFilter, setSelectedUniversityFilter] = useState<string | "all">("all");
  const [selectedRangeFilter, setSelectedRangeFilter] = useState<"all" | "20" | "50" | "100" | "200">("all");
  const [cardIndex, setCardIndex] = useState(0);
  const [discoverView, setDiscoverView] = useState<"list" | "swipe">("list");
  const [goLiveActive, setGoLiveActive] = useState(false);
  const [imageIndexMap, setImageIndexMap] = useState<Record<string, number>>({});

  const { inboundPending } = useInviteInboxCount();
  const { hasNotification: hasFriendAcceptanceNotification, latestFriendPeerId } = useFriendAcceptanceIndicator();
  const { totalUnread: chatUnreadCount, acknowledgeAll: acknowledgeChatUnread } = useChatUnreadIndicator();
  const { entries: chatRosterEntries, loading: chatRosterLoading, error: chatRosterError, refresh: refreshChatRoster } = useChatRoster();
  const { hasPending: hasTypingInvite, openLatest: openTypingInvite } = useTypingDuelInviteState();
  const hasFriendsNotification = hasFriendAcceptanceNotification || inboundPending > 0;

  const friendsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (hasFriendAcceptanceNotification) {
      params.set("filter", "accepted");
      if (latestFriendPeerId) {
        params.set("focus", latestFriendPeerId);
      }
    } else if (inboundPending > 0) {
      params.set("filter", "pending");
    }
    const query = params.toString();
    return query ? `/friends?${query}` : "/friends";
  }, [hasFriendAcceptanceNotification, inboundPending, latestFriendPeerId]);

  useEffect(() => {
    const hydrate = () => {
      setAuthUser(readAuthUser());
      setAuthHydrated(true);
    };
    hydrate();
    const unsubscribe = onAuthChange(hydrate);
    return () => unsubscribe();
  }, []);

  const formatCount = (value: number): string => (value > 99 ? "99+" : String(value));

  const [discoverPeople, setDiscoverPeople] = useState<FriendPreview[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const palette = [
      "from-rose-300 via-amber-200 to-emerald-200",
      "from-indigo-300 via-sky-200 to-emerald-200",
      "from-amber-200 via-rose-200 to-blue-200",
      "from-emerald-200 via-teal-200 to-cyan-200",
      "from-purple-200 via-rose-200 to-amber-200",
    ];
    const normalizeYear = (value: string | undefined): FriendPreview["year"] | "all" => {
      const lower = value?.toLowerCase?.() ?? "";
      if (["freshman", "first year", "first-year"].includes(lower)) return "freshman";
      if (["sophomore", "second year", "second-year"].includes(lower)) return "sophomore";
      if (["junior", "third year", "third-year"].includes(lower)) return "junior";
      if (["senior", "fourth year", "fourth-year"].includes(lower)) return "senior";
      if (["grad", "graduate"].includes(lower)) return "grad";
      return "all";
    };
    const load = async () => {
      setDiscoverLoading(true);
      setDiscoverError(null);
      try {
        const userId = authUser?.userId;
        const campusId = authUser?.campusId;
        if (!userId || !campusId) {
          if (!cancelled) {
            setDiscoverPeople([]);
            setDiscoverError("Sign in to view nearby people.");
            setDiscoverLoading(false);
          }
          return;
        }
        const backend = getBackendUrl().replace(/\/$/, "");
        const headers: Record<string, string> = {};
        if (userId) headers["X-User-Id"] = userId;
        if (campusId) headers["X-Campus-Id"] = campusId;
        const radius = selectedRangeFilter === "all" ? 100 : Number(selectedRangeFilter);
        const url = new URL(`${backend}/proximity/nearby`);
        url.searchParams.set("campus_id", campusId);
        url.searchParams.set("radius_m", String(radius));
        const response = await fetch(url.toString(), { cache: "no-store", headers });
        if (!response.ok) {
          throw new Error(`Discover request failed (${response.status})`);
        }
        const payload = await response.json();
        const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
        const mapped: FriendPreview[] = items.map((item: any, idx: number) => {
          const year = normalizeYear(item.year);
          const gallery = Array.isArray(item.gallery)
            ? (item.gallery.filter(Boolean) as string[])
            : Array.isArray(item.images)
              ? (item.images.filter(Boolean) as string[])
              : null;
          return {
            name: item.display_name ?? item.name ?? item.handle ?? "Unknown",
            detail: item.handle ? `@${item.handle}` : "Nearby classmate",
            status: item.is_friend ? "Online" : "Away",
            major: item.major ?? "Undeclared",
            year: year === "all" ? "freshman" : year,
            campus: item.campus ?? "University",
            avatarColor: palette[idx % palette.length],
            imageUrl: item.avatar_url ?? item.imageUrl ?? item.avatar ?? null,
            distance: typeof item.distance_m === "number" ? item.distance_m : null,
            gallery,
          };
        });
        if (!cancelled) {
          setDiscoverPeople(mapped);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load nearby people";
          setDiscoverError(message);
        }
      } finally {
        if (!cancelled) setDiscoverLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authUser?.campusId, authUser?.userId, selectedRangeFilter]);

  const activityLeaderboard = useMemo(() => {
    const name = authUser?.displayName?.split(" ")[0] ?? (authUser?.handle ? `@${authUser.handle}` : "You");
    return {
      name,
      totalGames: 48,
      wins: 32,
      streak: 3,
    };
  }, [authUser?.displayName, authUser?.handle]);

  const friendPreviewList = useMemo(() => discoverPeople, [discoverPeople]);
  const availableMajors = useMemo(() => Array.from(new Set(friendPreviewList.map((friend) => friend.major))), [friendPreviewList]);
  const availableUniversities = useMemo(() => Array.from(new Set(friendPreviewList.map((friend) => friend.campus))), [friendPreviewList]);
  const visibleFriendPreviewList = useMemo(() => {
    return friendPreviewList.filter((friend) => {
      const matchesYear = selectedYearFilter === "all" || friend.year === selectedYearFilter;
      const matchesMajor = selectedMajorFilter === "all" || friend.major === selectedMajorFilter;
      const matchesUniversity = selectedUniversityFilter === "all" || friend.campus === selectedUniversityFilter;
      const matchesRange =
        selectedRangeFilter === "all" ||
        friend.distance === undefined ||
        friend.distance === null ||
        friend.distance <= Number(selectedRangeFilter);
      return matchesYear && matchesMajor && matchesUniversity && matchesRange;
    });
  }, [friendPreviewList, selectedUniversityFilter, selectedMajorFilter, selectedYearFilter, selectedRangeFilter]);

  const chatPreviewCards = useMemo<ChatPreview[]>(() => {
    if (!chatRosterEntries.length) {
      return [];
    }
    return chatRosterEntries.map((entry, index) => ({
      name: entry.displayName,
      handle: entry.handle ? `@${entry.handle}` : entry.peerId.slice(0, 12),
      snippet: entry.lastMessageSnippet ?? "Tap to start the conversation.",
      time: formatChatTime(entry.lastMessageAt),
      status: index % 2 === 0 ? "online" : "away",
      unread: entry.unreadCount ?? 0,
      accent: CHAT_ACCENTS[index % CHAT_ACCENTS.length],
    }));
  }, [chatRosterEntries]);

  useEffect(() => {
    if (cardIndex >= visibleFriendPreviewList.length) {
      setCardIndex(Math.max(visibleFriendPreviewList.length - 1, 0));
    }
  }, [visibleFriendPreviewList.length, cardIndex]);

  useEffect(() => {
    if (cardIndex >= visibleFriendPreviewList.length) {
      setCardIndex(Math.max(visibleFriendPreviewList.length - 1, 0));
    }
  }, [visibleFriendPreviewList.length, cardIndex]);

  const topRightDisplayName = useMemo(() => {
    if (!authUser) {
      return null;
    }
    return authUser.handle?.trim() ?? authUser.displayName?.trim() ?? authUser.email ?? "";
  }, [authUser]);

  const handleSignOut = useCallback(() => {
    clearAuthSnapshot();
    setAuthUser(null);
  }, []);

  const openFilterModal = useCallback(() => {
    setDraftMajorFilter(selectedMajorFilter);
    setDraftYearFilter(selectedYearFilter);
    setDraftUniversityFilter(selectedUniversityFilter);
    setDraftRangeFilter(selectedRangeFilter);
    setFilterModalOpen(true);
  }, [selectedUniversityFilter, selectedMajorFilter, selectedYearFilter, selectedRangeFilter]);

  const getFriendImages = useCallback((friend: FriendPreview): string[] => {
    if (Array.isArray(friend.gallery) && friend.gallery.length > 0) {
      return friend.gallery.filter(Boolean) as string[];
    }
    if (friend.imageUrl) {
      return [friend.imageUrl];
    }
    return [];
  }, []);

  const getCurrentImage = useCallback(
    (friend: FriendPreview) => {
      const images = getFriendImages(friend);
      if (!images.length) return null;
      const idx = imageIndexMap[friend.name] ?? 0;
      return images[idx % images.length];
    },
    [getFriendImages, imageIndexMap],
  );

  const advanceImage = useCallback(
    (friend: FriendPreview) => {
      const images = getFriendImages(friend);
      if (images.length < 2) return;
      setImageIndexMap((prev) => {
        const current = prev[friend.name] ?? 0;
        return { ...prev, [friend.name]: (current + 1) % images.length };
      });
    },
    [getFriendImages],
  );

  const handleApplyFilters = useCallback(() => {
    setSelectedMajorFilter(draftMajorFilter);
    setSelectedYearFilter(draftYearFilter);
    setSelectedUniversityFilter(draftUniversityFilter);
    setSelectedRangeFilter(draftRangeFilter);
    setFilterModalOpen(false);
  }, [draftUniversityFilter, draftMajorFilter, draftYearFilter, draftRangeFilter]);

  const handleCancelFilters = useCallback(() => {
    setDraftMajorFilter(selectedMajorFilter);
    setDraftYearFilter(selectedYearFilter);
    setDraftUniversityFilter(selectedUniversityFilter);
    setDraftRangeFilter(selectedRangeFilter);
    setFilterModalOpen(false);
  }, [selectedUniversityFilter, selectedMajorFilter, selectedYearFilter, selectedRangeFilter]);

const navItems = useMemo(
	() => [
		{ key: "dashboard" as const, label: "Discovery", icon: <DashboardIcon />, badge: null },
      {
        key: "friends" as const,
        label: "Friends",
        icon: <UsersIcon />,
        badge: hasFriendsNotification ? (inboundPending > 0 ? formatCount(inboundPending) : "New") : null,
      },
      {
        key: "chats" as const,
        label: "Chats",
        icon: <ChatIcon />,
        badge: chatUnreadCount > 0 ? formatCount(chatUnreadCount) : null,
      },
      {
        key: "activities" as const,
        label: "Activities",
        icon: <ActivityIcon />,
        badge: hasTypingInvite ? "Live" : null,
      },
      {
        key: "settings" as const,
        label: "Settings",
        icon: <SettingsIcon />,
        badge: null,
      },
    ],
    [hasFriendsNotification, inboundPending, chatUnreadCount, hasTypingInvite],
  );

  const handleNavClick = (key: NavKey) => {
    setActiveSection(key);
    if (key === "chats") {
      acknowledgeChatUnread();
    }
    if (key === "activities" && hasTypingInvite) {
      openTypingInvite();
    }
  };
  const renderSection = () => {
    switch (activeSection) {
      case "friends":
        return (
          <div className="space-y-5">
            <header className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.35em] text-rose-400">Friends</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Stay in sync with your circle</h2>
              <p className="mt-2 text-sm text-slate-600">
                {hasFriendsNotification
                  ? "You have updates waiting. Tap through to approve invites or greet new peers."
                  : "Invite classmates or accept pending requests to populate your radar."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={friendsHref} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800">
                  Open friends
                </Link>
                <Link href="/social" className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500">
                  Explore socializing
                </Link>
              </div>
            </header>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Pending invites</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{inboundPending > 0 ? formatCount(inboundPending) : "All clear"}</p>
                <p className="text-xs text-slate-500">Approved friends land in chat instantly.</p>
              </div>
              <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-rose-500">Live connections</p>
                <p className="mt-2 text-3xl font-semibold text-rose-600">{hasFriendAcceptanceNotification ? "New matches" : "Keep exploring"}</p>
                <p className="text-xs text-rose-500">Glow on your radar when friends head nearby.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quick actions</p>
                <div className="mt-3 flex flex-col gap-2">
                  <Link
                    href="/friends?filter=pending"
                    className="inline-flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-400"
                  >
                    Review invites
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {inboundPending > 0 ? formatCount(inboundPending) : "0"}
                    </span>
                  </Link>
                  <Link
                    href="/friends?filter=accepted"
                    className="inline-flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-400"
                  >
                    See roster
                    <span className="text-xs text-slate-500">Chat-ready</span>
                  </Link>
                  <Link
                    href="/chat"
                    className="inline-flex items-center justify-between rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
                  >
                    Open chats
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent friends</p>
                  <p className="text-sm text-slate-600">Newest people in your circle.</p>
                </div>
                <Link href="/friends" className="text-xs font-semibold text-rose-500 hover:text-rose-600">
                  Manage all
                </Link>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {friendPreviewList.map((friend) => (
                  <div key={friend.name} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700">
                        {friend.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{friend.name}</p>
                        <p className="text-xs text-slate-500">{friend.detail}</p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        friend.status === "Online" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {friend.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
      </div>
    );
  case "chats":
    return (
      <div className="space-y-5">
        <header className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-r from-[#0f152a] via-[#1c2340] to-[#0f152a] p-6 text-white shadow-xl">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.14),_transparent_60%)] blur-3xl" aria-hidden />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl space-y-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-rose-200">Chats preview</p>
              <h2 className="text-2xl font-semibold md:text-3xl">Drop into conversations without opening the full inbox</h2>
              <p className="text-sm text-slate-200/90">
                Peek at the latest threads and reply cues. The full experience lives at <span className="font-semibold">/chat</span>.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0f152a] shadow hover:bg-rose-50"
                >
                  Open full chats
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  href="/friends"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/60"
                >
                  Find classmates
                </Link>
              </div>
            </div>
            <div className="grid w-full max-w-xs grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/10 p-3 text-left">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[0.6rem] uppercase tracking-[0.25em] text-rose-100">Unread</p>
                <p className="text-2xl font-semibold">{chatUnreadCount > 0 ? formatCount(chatUnreadCount) : "All clear"}</p>
                <p className="text-xs text-slate-200/80">Synced across devices</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[0.6rem] uppercase tracking-[0.25em] text-rose-100">Connections</p>
                <p className="text-2xl font-semibold">{friendPreviewList.length || 5}</p>
                <p className="text-xs text-slate-200/80">Ready to ping</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-rose-400">Threads in motion</p>
                <p className="text-sm text-slate-600">Latest pulses from friends and studios.</p>
              </div>
              <Link href="/chat" className="text-xs font-semibold text-rose-500 hover:text-rose-600">
                Jump to inbox
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {chatRosterLoading
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={`chat-skeleton-${idx}`}
                      className="h-36 animate-pulse rounded-2xl border border-slate-100 bg-white/70"
                    />
                  ))
                : chatPreviewCards.length
                  ? chatPreviewCards.map((chat) => (
                      <div
                        key={chat.handle}
                        className={`relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br ${chat.accent} p-4 shadow-sm`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{chat.name}</p>
                            <p className="text-xs text-slate-500">{chat.handle}</p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              chat.status === "online" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {chat.status === "online" ? "Online" : "Away"}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-800 line-clamp-2">{chat.snippet}</p>
                        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                          <span>{chat.time}</span>
                          {chat.unread ? (
                            <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                              {chat.unread} new
                            </span>
                          ) : (
                            <span className="text-slate-400">All caught up</span>
                          )}
                        </div>
                      </div>
                    ))
                  : (
                    <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 text-sm text-slate-600 shadow-sm md:col-span-2">
                      {chatRosterError ? chatRosterError : "No conversations yet. Send a hello from the /chat page."}
                    </div>
                  )}
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border border-rose-100 bg-rose-50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-rose-500">Inbox snapshot</p>
                <p className="text-sm text-rose-700">Glance before diving in.</p>
              </div>
              <Link href="/chat" className="text-xs font-semibold text-rose-600 hover:text-rose-700">
                Open /chat
              </Link>
            </div>
            <div className="space-y-3">
              {friendPreviewList.slice(0, 4).map((friend) => (
                <div key={friend.name} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-3 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br ${friend.avatarColor} text-sm font-semibold text-slate-900`}>
                      {friend.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{friend.name}</p>
                      <p className="text-xs text-slate-500">{friend.detail}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-rose-500">{friend.status}</span>
                </div>
              ))}
              {!friendPreviewList.length ? (
                <div className="rounded-2xl border border-rose-100 bg-white/80 px-4 py-3 text-xs text-rose-700">
                  Add friends to populate your chat sidebar.
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-rose-100 bg-white/70 px-4 py-3 text-xs text-rose-700">
              Pinned tip: Start in /chat to thread messages, share files, and enable delivery receipts.
            </div>
          </section>
        </div>
      </div>
    );
  case "activities":
    return (
          <div className="space-y-5">
            <header className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.35em] text-rose-400">Activities</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Launch games or accept invites</h2>
              <p className="mt-2 text-sm text-slate-600">
                {hasTypingInvite
                  ? "You have a live invite waiting. Tap below to join."
                  : "Challenge friends to typing duels, trivia, or rock-paper-scissors without leaving this view."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/activities" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800">
                  Browse activities
                </Link>
                <button
                  type="button"
                  onClick={() => hasTypingInvite && openTypingInvite()}
                  disabled={!hasTypingInvite}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {hasTypingInvite ? "Open invite" : "Waiting for invites"}
                </button>
              </div>
            </header>
            <div className="rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 via-rose-25 to-amber-50 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-rose-500">Your activity snapshot</p>
                  <h3 className="mt-2 text-lg font-semibold text-rose-900">How you're doing this week</h3>
                  <p className="mt-1 text-xs text-rose-700/90">
                    Track your streaks and wins across Divan games. These numbers update as you play duels, trivia, and more.
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2 text-xs font-medium text-rose-700 shadow-sm">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700">
                    {activityLeaderboard.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="leading-tight">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-rose-400">Player</p>
                    <p className="text-sm font-semibold text-rose-800 truncate max-w-[9rem]">{activityLeaderboard.name}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-rose-900 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-rose-500">
                    <span>Total games</span>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px]">All modes</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{activityLeaderboard.totalGames}</p>
                  <p className="mt-1 text-xs text-rose-500">Every duel, quiz, and match you've played on Divan.</p>
                </div>

                <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-emerald-900 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-emerald-500">
                    <span>Wins</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px]">Best rounds</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{activityLeaderboard.wins}</p>
                  <p className="mt-1 text-xs text-emerald-500">Times you've finished on top against friends and classmates.</p>
                </div>

                <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-amber-900 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-amber-500">
                    <span>Win streak</span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px]">Current run</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{activityLeaderboard.streak}</p>
                  <p className="mt-1 text-xs text-amber-500">Keep playing without losing to grow this streak.</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-700/90">
                <p>
                  Ready to climb higher? Open <span className="font-semibold">Typing Duel</span> or <span className="font-semibold">Quick Trivia</span> below and your
                  wins will land here.
                </p>
                <Link
                  href="/activities"
                  className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
                >
                  View full leaderboard
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    className="h-3.5 w-3.5"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5h10M19 5v10M19 5 5 19" />
                  </svg>
                </Link>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activityPreviews.map((game) => (
                <Link
                  key={game.title}
                  href={game.href}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-900 via-slate-900/90 to-[#0d0f1d] shadow-[0_20px_60px_rgba(15,23,42,0.45)] transition hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(15,23,42,0.55)]"
                >
                  <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      Preview
                    </span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[0.65rem] text-white">{game.badge}</span>
                  </div>
                  <div className={`relative h-32 bg-gradient-to-r ${game.gradient}`}>
                    <div className="absolute inset-0 opacity-30 blur-3xl" />
                    <div className={`absolute left-4 top-6 h-2 w-24 rounded-full ${game.accent} opacity-80`} />
                    <div className="absolute left-4 top-12 flex gap-2">
                      <span className="h-2 w-12 rounded-full bg-white/20" />
                      <span className="h-2 w-10 rounded-full bg-white/15" />
                      <span className="h-2 w-16 rounded-full bg-white/10" />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 px-5 py-4 bg-gradient-to-b from-[#111428] via-[#111424] to-[#0c0f1f]">
                    <div>
                      <h3 className="text-base font-semibold text-white">{game.title}</h3>
                      <p className="mt-1 text-sm text-slate-300">{game.description}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                        You
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-200">
                        Friend
                      </span>
                      <span className="ml-auto rounded-full bg-white/5 px-2 py-1">2 players</span>
                    </div>
                    <button
                      type="button"
                      className="mt-auto inline-flex items-center justify-center rounded-2xl bg-[#ff5f72] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,95,114,0.35)] transition hover:bg-[#ff4b61] group-hover:translate-y-[-1px]"
                    >
                      Open activity window
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      case "settings":
        return (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-xl">
            <ProfileSettingsInline />
          </div>
        );
      case "dashboard":
      default:
        return (
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-base uppercase tracking-[0.35em] text-rose-500">People nearby</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">Who is within your discovery range</h2>
                </div>
                <div className="inline-flex items-center gap-1 rounded-2xl bg-slate-100 p-1 text-xs font-semibold text-slate-700">
                  <button
                    type="button"
                    onClick={() => setDiscoverView("list")}
                    className={`rounded-xl px-3 py-2 transition ${discoverView === "list" ? "bg-white text-slate-900 shadow-sm" : "hover:bg-white/60"}`}
                  >
                    List View
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscoverView("swipe")}
                    className={`rounded-xl px-3 py-2 transition ${discoverView === "swipe" ? "bg-white text-slate-900 shadow-sm" : "hover:bg-white/60"}`}
                  >
                    Swipe View
                  </button>
                </div>
              </div>

              {discoverView === "list" ? (
                <ul className="mt-4 space-y-3">
                  {discoverLoading && visibleFriendPreviewList.length === 0 ? (
                    <li className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                      Loading nearby people...
                    </li>
                  ) : visibleFriendPreviewList.length === 0 ? (
                    <li className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                      {discoverError ?? "No nearby friends match your filters."}
                    </li>
                  ) : (
                    visibleFriendPreviewList.map((friend) => (
                      <li
                        key={friend.name}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-slate-100 via-white to-slate-50 p-[1px] text-sm font-semibold text-slate-900"
                            onClick={() => advanceImage(friend)}
                            role="button"
                            tabIndex={0}
                          >
                            {(() => {
                              const currentImage = getCurrentImage(friend);
                              if (currentImage) {
                                return <img src={currentImage} alt={friend.name} className="h-full w-full rounded-full object-cover" />;
                              }
                              return (
                                <span className={`bg-gradient-to-br ${friend.avatarColor} inline-flex h-full w-full items-center justify-center rounded-full text-sm font-semibold text-slate-900`}>
                                  {friend.name.slice(0, 2).toUpperCase()}
                                </span>
                              );
                            })()}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{friend.name}</p>
                            <p className="text-xs text-slate-500">{friend.detail}</p>
                            <p className="text-xs font-semibold text-slate-700">
                              {friend.major} · {friend.year} · {friend.campus}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                            {friend.status}
                          </span>
                          <div className="flex items-center gap-2">
                            <Link href="/friends" className="text-[11px] font-semibold text-rose-500 hover:text-rose-600">
                              View profile
                            </Link>
                            <Link
                              href="/friends?filter=pending"
                              className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white shadow hover:bg-emerald-400"
                            >
                              Send invite
                            </Link>
                          </div>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <div className="mt-4 flex flex-col items-center gap-5">
                  <p className="text-xs uppercase tracking-[0.35em] text-rose-400">Swipe to discover</p>
                  {discoverLoading && visibleFriendPreviewList.length === 0 ? (
                    <div className="flex h-64 w-full max-w-xl items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                      Loading profiles...
                    </div>
                  ) : visibleFriendPreviewList.length === 0 ? (
                    <div className="flex h-64 w-full max-w-xl items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                      {discoverError ?? "No profiles to show."}
                    </div>
                  ) : (
                    <div className="flex w-full max-w-xl flex-col items-center gap-4">
                      {(() => {
                        const friend = visibleFriendPreviewList[cardIndex];
                        const currentImage = getCurrentImage(friend);
                        return (
                          <div className="w-full rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-white p-5 shadow-lg sm:p-7">
                            <button
                              type="button"
                              onClick={() => advanceImage(friend)}
                              className={`relative h-72 w-full overflow-hidden rounded-2xl ${currentImage ? "" : `bg-gradient-to-br ${friend.avatarColor}`} flex items-end p-4`}
                            >
                              {currentImage ? (
                                <img src={currentImage} alt={friend.name} className="absolute inset-0 h-full w-full object-cover" />
                              ) : null}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                              <div className="relative flex flex-col gap-1 text-white">
                                <p className="text-lg font-semibold">{friend.name}</p>
                                <p className="text-sm text-white/80">
                                  {friend.major} · {friend.year}
                                </p>
                                <p className="text-xs text-white/70">University: {friend.campus}</p>
                              </div>
                            </button>
                          </div>
                        );
                      })()}
                      <div className="flex w-full justify-end">
                        <Link
                          href="/friends?filter=pending"
                          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400"
                        >
                          Send invite
                        </Link>
                      </div>
                      <div className="flex w-full items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setCardIndex((prev) => (prev - 1 + visibleFriendPreviewList.length) % visibleFriendPreviewList.length)}
                          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow hover:border-slate-400"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setCardIndex((prev) => (prev + 1) % visibleFriendPreviewList.length)}
                          className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={() => setGoLiveActive((prev) => !prev)}
                  className="w-full max-w-xl rounded-2xl bg-[#f05656] px-5 py-4 text-base font-semibold text-white shadow hover:bg-[#e14a4a]"
                >
                  {goLiveActive ? "Turn off Live" : "Go Live"}
                </button>
                <button
                  type="button"
                  onClick={openFilterModal}
                  className="w-full max-w-xl rounded-2xl border border-slate-200 px-5 py-4 text-base font-semibold text-slate-800 shadow hover:border-slate-400"
                >
                  Filter
                </button>
                <div className="flex w-full justify-center">
                  <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <HomeProximityPreview variant="mini" autoLive={goLiveActive} />
                  </div>
                </div>
              </div>
            </section>

            {filterModalOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div
                  className="absolute inset-0 bg-black/40"
                  role="button"
                  aria-label="Close filters"
                  onClick={handleCancelFilters}
                />
                <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Filters</p>
                      <h3 className="text-lg font-semibold text-slate-900">Tune who you see</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelFilters}
                      className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                      aria-label="Close filter panel"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M14 6l-8 8" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500" htmlFor={majorFilterId}>
                        Major
                      </label>
                      <select
                        id={majorFilterId}
                        value={draftMajorFilter}
                        onChange={(e) => setDraftMajorFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      >
                        <option value="all">All majors</option>
                        {availableMajors.map((major) => (
                          <option key={major} value={major}>
                            {major}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500" htmlFor={yearFilterId}>
                        Year
                      </label>
                      <select
                        id={yearFilterId}
                        value={draftYearFilter}
                        onChange={(e) => setDraftYearFilter(e.target.value as FriendPreview["year"] | "all")}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      >
                        <option value="all">All years</option>
                        <option value="freshman">First year</option>
                        <option value="sophomore">Second year</option>
                        <option value="junior">Third year</option>
                        <option value="senior">Fourth year</option>
                        <option value="grad">Graduate</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500" htmlFor={campusFilterId}>
                        University
                      </label>
                      <select
                        id={campusFilterId}
                        value={draftUniversityFilter}
                        onChange={(e) => setDraftUniversityFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      >
                        <option value="all">All universities</option>
                        {availableUniversities.map((campus) => (
                          <option key={campus} value={campus}>
                            {campus}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500" htmlFor={rangeFilterId}>
                        Range
                      </label>
                      <select
                        id={rangeFilterId}
                        value={draftRangeFilter}
                        onChange={(e) => setDraftRangeFilter(e.target.value as "all" | "20" | "50" | "100" | "200")}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      >
                        <option value="all">Any distance</option>
                        <option value="20">Within 20</option>
                        <option value="50">Within 50</option>
                        <option value="100">Within 100</option>
                        <option value="200">Within 200</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleCancelFilters}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyFilters}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );    }
  };
  return (
    <main className="min-h-screen bg-gradient-to-r from-white via-rose-50 to-white text-base md:text-lg">
      <div className="flex min-h-screen w-full gap-8 px-0">
        <aside className="flex w-64 flex-col border-r border-rose-100 bg-white/90 px-4 py-8 text-slate-700 shadow-xl">
          <div className="flex items-center gap-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-rose-500">
            <BrandLogo className="flex" logoClassName="h-16 w-auto" logoWidth={96} logoHeight={96} withWordmark />
          </div>
          <nav aria-label="Primary" className="mt-6 flex flex-col gap-1.5">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item.key)}
                aria-current={activeSection === item.key ? "page" : undefined}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm md:text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f05656] ${
                  activeSection === item.key ? "bg-[#f05656] text-white shadow-lg" : "text-slate-700 hover:bg-rose-50"
                }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.badge ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      activeSection === item.key ? "bg-white/20 text-white" : "bg-slate-900 text-white"
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="mt-8">
            {!authHydrated ? (
              <div className="animate-pulse rounded-2xl border border-slate-200 bg-white/70 p-4">
                <div className="h-3 w-20 rounded-full bg-slate-200" />
                <div className="mt-3 h-5 w-3/4 rounded-full bg-slate-200" />
                <div className="mt-4 flex gap-2">
                  <div className="h-9 flex-1 rounded-xl bg-slate-200" />
                  <div className="h-9 flex-1 rounded-xl bg-slate-200" />
                </div>
              </div>
            ) : authUser ? (
              <div className="rounded-2xl border border-rose-100 bg-white/85 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-600">
                    {topRightDisplayName?.slice(0, 1).toUpperCase() ?? "U"}
                  </div>
                  <p className="truncate text-sm font-semibold text-slate-900" title={topRightDisplayName ?? undefined}>
                    {topRightDisplayName}
                  </p>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 17l5-5-5-5m5 5H9m4 5v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
                <Link
                  href="/onboarding"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
                >
                  Join Divan
                </Link>
                <Link
                  href="/login"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </aside>
        <section className="flex-1 px-6 py-12 md:px-10">
          <div className="mx-auto max-w-6xl space-y-8">{renderSection()}</div>
        </section>
      </div>
    </main>
  );
}
