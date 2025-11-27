/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CheckCircle2, Loader2 } from "lucide-react";

import BrandLogo from "@/components/BrandLogo";
import { useStoryInviteState } from "@/components/providers/story-invite-provider";
import { useTypingDuelInviteState } from "@/components/providers/typing-duel-invite-provider";
import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";
import { useInviteInboxCount } from "@/hooks/social/use-invite-count";
import { useChatUnreadIndicator } from "@/hooks/chat/use-chat-unread-indicator";
import { useChatRoster } from "@/hooks/chat/use-chat-roster";
import { usePresence } from "@/hooks/presence/use-presence";
import { fetchDiscoveryFeed } from "@/lib/discovery";
import { fetchLeaderboard, fetchMySummary } from "@/lib/leaderboards";
import { fetchProfile } from "@/lib/identity";
import { clearAuthSnapshot, onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { NetworkProgressCircle } from "@/components/NetworkProgressCircle";
import { fetchFriends, sendInvite } from "@/lib/social";
import type { FriendRow, ProfileRecord } from "@/lib/types";

const iconClassName = "h-4 w-4 flex-none";

const DiscoveryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="m16 8-1.6 6.6L8 16l1.6-6.6Z" />
    <circle cx="12" cy="12" r="1.2" />
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
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const ActivityIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
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

// HeartIcon removed (unused)
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
    key: "speed_typing",
    title: "Speed Typing Duel",
    description: "Race head-to-head to finish the sample with accuracy.",
    href: "/activities/speed_typing",
    tag: "Live duel",
    image: "/activities/speedtyping.svg",
  },
  {
    key: "quick_trivia",
    title: "Quick Trivia",
    description: "Rapid questions. Earn points for correctness and speed.",
    href: "/activities/quick_trivia",
    tag: "PvP",
    image: "/activities/trivia.svg",
  },
  {
    key: "rps",
    title: "Rock / Paper / Scissors",
    description: "Real-time duel game used in earlier calibration labs.",
    href: "/activities/rock_paper_scissors",
    tag: "Classic",
    image: "/activities/rps.svg",
  },
  {
    key: "story",
    title: "Story Builder",
    description: "Collaborative romance story. You write one part, they write the next.",
    href: "/activities/story",
    tag: "New",
    image: "/activities/story.svg",
  },
];

type FriendPreview = {
  userId: string;
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
  campusId?: string | null;
  passions?: string[];
  courses?: string[];
  isFriend?: boolean;
  isFriendOfFriend?: boolean;
  compatibilityScore?: number;
};

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

type NavKey = "dashboard" | "friends" | "chats" | "activities" | "settings" | "discovery" | "meetups";
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
  const [goLiveActive, setGoLiveActive] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [selfProfile, setSelfProfile] = useState<ProfileRecord | null>(null);
  const [recentFriends, setRecentFriends] = useState<FriendRow[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [suggestedPeople, setSuggestedPeople] = useState<FriendPreview[]>([]);
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());

  const handleToggleLive = () => {
    if (goLiveActive) {
      setGoLiveActive(false);
      return;
    }

    setIsActivating(true);
    // Simulate activation delay for effect
    setTimeout(() => {
      setGoLiveActive(true);
      setIsActivating(false);
    }, 1500);
  };

  const { inboundPending } = useInviteInboxCount();
  const { hasNotification: hasFriendAcceptanceNotification, latestFriendPeerId } = useFriendAcceptanceIndicator();
  const { totalUnread: chatUnreadCount, acknowledgeAll: acknowledgeChatUnread } = useChatUnreadIndicator();
  const { entries: chatRosterEntries, loading: chatRosterLoading, error: chatRosterError } = useChatRoster();
  const { hasPending: hasStoryInvite, openLatest: openStoryInvite } = useStoryInviteState();
  const { hasPending: hasTypingInvite, openLatest: openTypingInvite } = useTypingDuelInviteState();
  const pendingInviteCount = (hasStoryInvite ? 1 : 0) + (hasTypingInvite ? 1 : 0);
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

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      if (!authUser?.userId) return;
      try {
        const profile = await fetchProfile(authUser.userId, authUser.campusId ?? null);
        if (!cancelled) {
          setSelfProfile(profile);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load profile for suggestions", err);
        }
      }
    };
    if (authHydrated) {
      void loadProfile();
    }
    return () => {
      cancelled = true;
    };
  }, [authHydrated, authUser?.campusId, authUser?.userId]);

  const formatCount = (value: number): string => (value > 99 ? "99+" : String(value));

  const [discoverPeople, setDiscoverPeople] = useState<FriendPreview[]>([]);
  const rosterPeerIds = useMemo(() => chatRosterEntries.map((entry) => entry.peerId), [chatRosterEntries]);
  const discoverPeerIds = useMemo(() => discoverPeople.map((p) => p.userId), [discoverPeople]);
  const { presence: rosterPresence } = usePresence(rosterPeerIds);
  const { presence: discoverPresence } = usePresence(discoverPeerIds);

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
      try {
        const userId = authUser?.userId;
        const campusId = authUser?.campusId;
        if (!userId || !campusId) {
          if (!cancelled) {
            setDiscoverPeople([]);
          }
          return;
        }
        const payload = await fetchDiscoveryFeed(userId, campusId, { limit: 50 });
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const mapped: FriendPreview[] = items.map((raw, idx) => {
          const graduationYear = (raw as { graduation_year?: number | string }).graduation_year;
          const passions =
            Array.isArray((raw as { passions?: string[] }).passions)
              ? (raw as { passions?: string[] }).passions?.filter((item): item is string => typeof item === "string" && item.trim().length > 0) ?? []
              : [];
          const courses =
            Array.isArray((raw as { courses?: string[] }).courses)
              ? (raw as { courses?: string[] }).courses?.filter((item): item is string => typeof item === "string" && item.trim().length > 0) ?? []
              : [];
          const galleryUrls =
            (raw as { gallery?: Array<{ url?: string }> }).gallery
              ?.map((entry) => entry.url)
              .filter((url): url is string => Boolean(url)) ?? [];
          const campusId = (raw as { campus_id?: string | null }).campus_id ?? authUser?.campusId ?? null;
          const isFriend = Boolean((raw as { is_friend?: boolean }).is_friend);
          const isFriendOfFriend = Boolean((raw as { is_friend_of_friend?: boolean }).is_friend_of_friend);
          const year = normalizeYear(graduationYear ? String(graduationYear) : undefined);
          return {
            userId: raw.user_id,
            name: raw.display_name || raw.handle || "Unknown",
            detail: raw.handle ? `@${raw.handle}` : passions[0] ?? "Nearby classmate",
            status: isFriend ? "Online" : "Away",
            major: raw.major ?? "Undeclared",
            year: year === "all" ? "freshman" : year,
            campus: campusId ?? "University",
            campusId,
            avatarColor: palette[idx % palette.length],
            imageUrl: raw.avatar_url ?? null,
            distance: typeof raw.distance_m === "number" ? raw.distance_m : null,
            gallery: galleryUrls,
            passions,
            courses,
            isFriend,
            isFriendOfFriend,
          };
        });
        if (!cancelled) {
          setDiscoverPeople(mapped);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Unable to load nearby people", err);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authUser?.campusId, authUser?.userId, selectedRangeFilter]);

  const [activitySnapshot, setActivitySnapshot] = useState<{
    totalGames: number;
    wins: number;
    streak: number;
    socialScore: number;
    loading: boolean;
    error: string | null;
  }>({
    totalGames: 0,
    wins: 0,
    streak: 0,
    socialScore: 0,
    loading: true,
    error: null,
  });
  const [leaderboardPreview, setLeaderboardPreview] = useState<{
    items: Array<{ rank: number; score: number; userId: string }>;
    loading: boolean;
    error: string | null;
  }>({
    items: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setActivitySnapshot((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const summary = await fetchMySummary({
          userId: authUser?.userId,
          campusId: authUser?.campusId ?? undefined,
          signal: controller.signal,
        });
        const totalGames = Math.max(0, Math.round(summary.scores.engagement ?? 0));
        const wins = Math.max(0, Math.round(summary.scores.overall ?? 0));
        const streak = Math.max(0, summary.streak?.current ?? 0);
        const socialScore = Math.max(0, Math.round(summary.scores.social ?? 0));
        setActivitySnapshot({ totalGames, wins, streak, socialScore, loading: false, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unable to load activity snapshot";
        setActivitySnapshot((prev) => ({ ...prev, loading: false, error: message }));
      }
    };
    if (authHydrated) {
      void load();
    }
    return () => controller.abort();
  }, [authHydrated, authUser?.campusId, authUser?.userId]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLeaderboardPreview((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetchLeaderboard("overall", {
          campusId: authUser?.campusId ?? undefined,
          limit: 5,
          signal: controller.signal,
        });
        const items =
          res?.items?.map((row) => ({
            rank: row.rank,
            score: row.score,
            userId: row.user_id,
          })) ?? [];
        setLeaderboardPreview({ items, loading: false, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unable to load leaderboard";
        setLeaderboardPreview((prev) => ({ ...prev, loading: false, error: message }));
      }
    };
    if (authHydrated) {
      void load();
    }
    return () => controller.abort();
  }, [authHydrated, authUser?.campusId]);

  useEffect(() => {
    const loadFriends = async () => {
      if (!authUser?.userId || !authUser?.campusId) return;
      try {
        const friends = await fetchFriends(authUser.userId, authUser.campusId, "accepted");
        setFriendCount(friends.length);
        // Sort by created_at desc
        const sorted = friends.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentFriends(sorted.slice(0, 2));
      } catch (err) {
        console.error("Failed to load recent friends", err);
      }
    };
    if (authHydrated) {
      void loadFriends();
    }
  }, [authHydrated, authUser?.campusId, authUser?.userId]);

  const myPassions = useMemo(
    () => (selfProfile?.passions ?? []).map((item) => item.toLowerCase().trim()).filter(Boolean),
    [selfProfile?.passions],
  );
  const myCourses = useMemo(
    () => (selfProfile?.courses ?? []).map((c) => (c.code || c.name).toLowerCase().trim()).filter(Boolean),
    [selfProfile?.courses],
  );
  const myMajor = useMemo(() => selfProfile?.major?.toLowerCase?.().trim() ?? null, [selfProfile?.major]);
  const recentFriendIds = useMemo(() => new Set(recentFriends.map((row) => row.friend_id)), [recentFriends]);

  const computeSuggestionScore = useCallback(
    (person: FriendPreview) => {
      let score = 0;
      if (person.campusId && authUser?.campusId && person.campusId === authUser.campusId) {
        score += 2;
      }
      if (person.isFriendOfFriend) {
        score += 5;
      }
      if (typeof person.distance === "number") {
        if (person.distance <= 20) score += 3;
        else if (person.distance <= 100) score += 2;
        else if (person.distance <= 250) score += 1;
      }
      if (myMajor && person.major?.toLowerCase?.().trim() === myMajor) {
        score += 2;
      }
      if (myPassions.length && person.passions?.length) {
        const shared = person.passions
          .map((item) => item.toLowerCase().trim())
          .filter((item) => myPassions.includes(item));
        if (shared.length > 0) {
          score += 1 + shared.length;
        }
      }
      if (myCourses.length && person.courses?.length) {
        const shared = person.courses
          .map((item) => item.toLowerCase().trim())
          .filter((item) => myCourses.includes(item));
        if (shared.length > 0) {
          score += 3 + shared.length * 2;
        }
      }
      return score;
    },
    [authUser?.campusId, myMajor, myPassions, myCourses],
  );

  useEffect(() => {
    const nonFriends = discoverPeople.filter(
      (person) => !person.isFriend && !recentFriendIds.has(person.userId),
    );
    const scored = nonFriends
      .map((person) => ({ ...person, compatibilityScore: computeSuggestionScore(person) }))
      .filter((person) => (person.compatibilityScore ?? 0) > 0);
    const sorted = scored.sort((a, b) => {
      if ((b.compatibilityScore ?? 0) !== (a.compatibilityScore ?? 0)) {
        return (b.compatibilityScore ?? 0) - (a.compatibilityScore ?? 0);
      }
      const aDistance = a.distance ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distance ?? Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    });
    if (sorted.length > 0) {
      setSuggestedPeople(sorted.slice(0, 3));
      return;
    }
    const fallback = [...nonFriends].sort((a, b) => {
      const aDistance = a.distance ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distance ?? Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    });
    setSuggestedPeople(fallback.slice(0, 3));
  }, [computeSuggestionScore, discoverPeople, recentFriendIds]);

  const handleConnect = async (userId: string) => {
    if (!authUser?.userId || !authUser?.campusId) return;
    try {
      setInviteSent((prev) => new Set(prev).add(userId));
      await sendInvite(authUser.userId, authUser.campusId, userId);
    } catch (err) {
      console.error("Failed to send invite", err);
      setInviteSent((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const activityLeaderboard = useMemo(() => {
    const name = authUser?.displayName?.split(" ")[0] ?? (authUser?.handle ? `@${authUser.handle}` : "You");
    return {
      name,
      totalGames: activitySnapshot.totalGames,
      wins: activitySnapshot.wins,
      streak: activitySnapshot.streak,
      score: activitySnapshot.socialScore,
    };
  }, [
    activitySnapshot.socialScore,
    activitySnapshot.streak,
    activitySnapshot.totalGames,
    activitySnapshot.wins,
    authUser?.displayName,
    authUser?.handle,
  ]);

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
  const discoveryPreviewList = useMemo<FriendPreview[]>(() => {
    return visibleFriendPreviewList.slice(0, 4);
  }, [visibleFriendPreviewList]);
  const discoveryFiltersActive = useMemo(
    () =>
      selectedMajorFilter !== "all" ||
      selectedYearFilter !== "all" ||
      selectedUniversityFilter !== "all" ||
      selectedRangeFilter !== "all",
    [selectedMajorFilter, selectedRangeFilter, selectedUniversityFilter, selectedYearFilter],
  );

  const chatPreviewCards = useMemo<ChatPreview[]>(() => {
    if (!chatRosterEntries.length) {
      return [];
    }
    return chatRosterEntries.map((entry, index) => ({
      name: entry.displayName,
      handle: entry.handle ? `@${entry.handle}` : entry.peerId.slice(0, 12),
      snippet: entry.lastMessageSnippet ?? "Tap to start the conversation.",
      time: formatChatTime(entry.lastMessageAt),
      status: rosterPresence[entry.peerId]?.online ? "online" : "away",
      unread: entry.unreadCount ?? 0,
      accent: CHAT_ACCENTS[index % CHAT_ACCENTS.length],
    }));
  }, [chatRosterEntries, rosterPresence]);

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
    const handle = authUser.handle?.trim();
    const name = authUser.displayName?.trim();
    return handle || name || "";
  }, [authUser]);

  const router = useRouter();
  const handleSignOut = useCallback(() => {
    clearAuthSnapshot();
    setAuthUser(null);
    router.push("/login");
  }, [router]);

  const openFilterModal = useCallback(() => {
    setDraftMajorFilter(selectedMajorFilter);
    setDraftYearFilter(selectedYearFilter);
    setDraftUniversityFilter(selectedUniversityFilter);
    setDraftRangeFilter(selectedRangeFilter);
    setFilterModalOpen(true);
  }, [selectedUniversityFilter, selectedMajorFilter, selectedYearFilter, selectedRangeFilter]);

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
      { key: "dashboard" as const, label: "Dashboard", icon: <DiscoveryIcon />, badge: null },
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
        badge: hasStoryInvite || hasTypingInvite ? "Live" : null,
      },
      {
        key: "settings" as const,
        label: "Settings",
        icon: <SettingsIcon />,
        badge: null,
      },
    ],
    [hasFriendsNotification, inboundPending, chatUnreadCount, hasStoryInvite, hasTypingInvite],
  );

  const handleNavClick = (key: NavKey) => {
    if (key === "meetups") {
      router.push("/meetups");
      return;
    }
    setActiveSection(key);
    if (key === "chats") {
      acknowledgeChatUnread();
    }
  };
  const renderSection = () => {
    switch (activeSection) {
      case "dashboard":
        return (
          <div className="space-y-6">
            <header>
              <h1 className="text-3xl font-bold text-slate-900">Welcome back, {authUser?.displayName || "Student"}</h1>
              <p className="text-slate-600">Here&apos;s what&apos;s happening in your network.</p>
            </header>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Network Building Stats */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">Network Building</h3>
                <div className="flex flex-col items-center">
                  <NetworkProgressCircle score={activitySnapshot.socialScore} className="mb-6" />
                  <div className="w-full space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Friends</span>
                      <span className="text-xl font-bold text-slate-900">{friendCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Pending Invites</span>
                      <span className="text-xl font-bold text-slate-900">{inboundPending}</span>
                    </div>
                    <p className="text-center text-xs text-slate-500">You&apos;re growing your circle!</p>
                  </div>
                </div>
              </div>

              {/* Activities Progress */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Activities</h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Active Invites</span>
                    <span className="text-xl font-bold text-slate-900">{pendingInviteCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Total Score</span>
                    <span className="text-xl font-bold text-slate-900">{activityLeaderboard.score}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.min((activityLeaderboard.score % 100), 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {activityLeaderboard.score > 0 ? "Keep playing to climb the leaderboard." : "Play games to earn points."}
                  </p>
                </div>
              </div>

              {/* Discovery Link */}
              <Link href="/discovery" className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-lg transition hover:shadow-xl">
                <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-2xl transition group-hover:bg-white/20" />
                <h3 className="relative text-xl font-bold">Discovery</h3>
                <p className="relative mt-2 text-slate-300">Find people around you and in other universities.</p>
                <div className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition group-hover:bg-white/30">
                  Launch Discovery
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </Link>

              {/* Recent Activity */}
              <div className="col-span-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2 lg:col-span-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Recent Activity</h3>
                <div className="mt-4 space-y-4">
                  {recentFriends.length === 0 && (
                    <div className="text-sm text-slate-500">No recent activity.</div>
                  )}
                  {recentFriends.map((friend) => (
                    <div key={friend.friend_id} className="flex items-start gap-4">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          You became friends with{" "}
                          <span className="font-bold">
                            {friend.friend_display_name ?? friend.friend_handle ?? friend.friend_id}
                          </span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Connections */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Suggested</h3>
                <div className="mt-4 space-y-4">
                  {suggestedPeople.length === 0 ? (
                    <div className="text-sm text-slate-500">No suggestions available.</div>
                  ) : (
                    suggestedPeople.slice(0, 3).map((person) => {
                      const isInvited = inviteSent.has(person.userId);
                      return (
                        <div key={person.userId} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200">
                              <img
                                src={person.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${person.name}`}
                                alt={person.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{person.name}</p>
                              <p className="text-xs text-slate-500">
                                {(() => {
                                  if (myCourses.length && person.courses?.length) {
                                    const shared = person.courses.filter((c) =>
                                      myCourses.includes(c.toLowerCase().trim()),
                                    );
                                    if (shared.length > 0) {
                                      return `${shared.length} shared course${shared.length > 1 ? "s" : ""}`;
                                    }
                                  }
                                  return person.campus;
                                })()}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleConnect(person.userId)}
                            disabled={isInvited}
                            className={`rounded-full p-2 transition ${isInvited ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                            aria-label={isInvited ? "Invite sent" : "Add friend"}
                          >
                            {isInvited ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
                <Link href="/discovery" className="mt-6 block w-full rounded-xl border border-slate-200 py-2 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  View All Suggestions
                </Link>
              </div>
            </div>
          </div>
        );
      case "friends":
        return (
          <div className="space-y-5">
            <header className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-r from-white via-rose-50 to-amber-50 p-6 shadow-lg">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),transparent_55%)]" aria-hidden />
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm uppercase tracking-[0.35em] text-rose-500">Friends</p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-900">Stay in sync with your circle</h2>
                  <p className="mt-2 text-sm text-slate-700">
                    {hasFriendsNotification
                      ? "You have updates waiting. Tap through to approve invites or greet new peers."
                      : "Invite classmates or accept pending requests to populate your radar."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href={friendsHref} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800">
                      Open friends
                    </Link>
                  </div>
                </div>
                <div className="flex items-center justify-center rounded-2xl bg-white/85 px-4 py-3 shadow-md ring-1 ring-rose-100">
                  <BrandLogo withWordmark logoWidth={210} logoHeight={210} logoClassName="h-40 w-auto" className="text-[#b7222d]" />
                </div>
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
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${discoverPresence[friend.userId]?.online ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                        }`}
                    >
                      {discoverPresence[friend.userId]?.online ? "Online" : "Away"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-indigo-500">Meetups</p>
                  <h3 className="mt-1 text-lg font-semibold text-indigo-900">Make room with your friends there</h3>
                  <p className="text-sm text-indigo-700">Plan gatherings and hangouts with your circle.</p>
                </div>
                <Link
                  href="/meetups"
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Open Meetups
                </Link>
              </div>
            </div>
          </div>
        );
      case "chats":
        return (
          <div className="space-y-5">
            <header className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-r from-[#0f152a] via-[#1c2340] to-[#0f152a] p-6 text-white shadow-xl">
              <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.14),_transparent_60%)] blur-3xl" aria-hidden />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
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
                <div className="flex w-full max-w-xs flex-col items-center gap-3 text-left">
                  <div className="w-full rounded-2xl bg-white/90 px-3 py-2 text-center shadow-md ring-1 ring-white/50">
                    <BrandLogo withWordmark logoWidth={200} logoHeight={200} logoClassName="h-40 w-auto" className="mx-auto text-[#b7222d]" />
                  </div>
                  <div className="grid w-full grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/10 p-3">
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
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chat.status === "online" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
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
                      <span className="text-[11px] font-semibold text-rose-500">{discoverPresence[friend.userId]?.online ? "Online" : "Away"}</span>
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
      case "activities": {
        const inviteMessage = hasStoryInvite
          ? "You have a story invite waiting. Tap below to join."
          : hasTypingInvite
            ? "You have a live typing duel invite ready."
            : "Challenge friends to typing duels, trivia, or rock-paper-scissors without leaving this view.";
        const inviteButtonLabel = hasStoryInvite
          ? "Open story invite"
          : hasTypingInvite
            ? "Open typing duel"
            : "Waiting for invites";
        const canOpenInvite = hasStoryInvite || hasTypingInvite;
        const handleInviteClick = () => {
          if (hasStoryInvite) {
            openStoryInvite();
            return;
          }
          if (hasTypingInvite) {
            openTypingInvite();
          }
        };
        return (
          <div className="space-y-5">
            <header className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-r from-white via-amber-50 to-rose-50 p-6 shadow-lg">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.9),transparent_55%)]" aria-hidden />
              <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm uppercase tracking-[0.35em] text-rose-500">Activities</p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-900">Launch games or accept invites</h2>
                  <p className="mt-2 text-sm text-slate-700">{inviteMessage}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleInviteClick}
                      disabled={!canOpenInvite}
                      className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {inviteButtonLabel}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-center rounded-2xl bg-white/85 px-4 py-3 shadow-md ring-1 ring-rose-100">
                  <BrandLogo withWordmark logoWidth={220} logoHeight={220} logoClassName="h-40 w-auto" className="text-[#b7222d]" />
                </div>
              </div>
            </header>
            <div className="rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 via-rose-25 to-amber-50 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-rose-500">Your activity snapshot</p>
                  <h3 className="mt-2 text-lg font-semibold text-rose-900">How you&apos;re doing this week</h3>
                  <p className="mt-1 text-xs text-rose-700/90">
                    Track your streaks and wins across Campus games. These numbers update as you play duels, trivia, and more.
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

              {activitySnapshot.error ? (
                <div className="mt-3 rounded-2xl bg-rose-100 px-3 py-2 text-[11px] font-semibold text-rose-700">
                  {activitySnapshot.error}
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-rose-900 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-rose-500">
                    <span>Total games</span>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px]">All modes</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {activitySnapshot.loading ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-rose-100" /> : activityLeaderboard.totalGames}
                  </p>
                  <p className="mt-1 text-xs text-rose-500">Every duel, quiz, and match you&apos;ve played on Campus.</p>
                </div>

                <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-emerald-900 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-emerald-500">
                    <span>Wins</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px]">Best rounds</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {activitySnapshot.loading ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-emerald-100" /> : activityLeaderboard.wins}
                  </p>
                  <p className="mt-1 text-xs text-emerald-500">Times you&apos;ve finished on top against friends and classmates.</p>
                </div>

                <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-amber-900 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-medium text-amber-500">
                    <span>Win streak</span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px]">Current run</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {activitySnapshot.loading ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-amber-100" /> : activityLeaderboard.streak}
                  </p>
                  <p className="mt-1 text-xs text-amber-500">Keep playing without losing to grow this streak.</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-700/90">
                <p>
                  Ready to climb higher? Open <span className="font-semibold">Typing Duel</span> or <span className="font-semibold">Quick Trivia</span> below and your
                  wins will land here.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Leaderboard preview</p>
                  <h3 className="text-lg font-semibold text-slate-900">Today&apos;s movers</h3>
                  <p className="text-xs text-slate-600">See where you stand against everyone this week.</p>
                </div>
                <Link
                  href="/leaderboards"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white shadow hover:-translate-y-0.5 hover:shadow-lg"
                >
                  Open leaderboard
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {leaderboardPreview.error ? (
                <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-600">
                  {leaderboardPreview.error}
                </div>
              ) : null}

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[60px_1fr_100px] bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                  <span>Rank</span>
                  <span>Player</span>
                  <span className="text-right">Score</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(leaderboardPreview.loading ? Array.from({ length: 5 }) : leaderboardPreview.items).map((entry: any, idx) => {
                    const rank = leaderboardPreview.loading ? idx + 1 : entry.rank;
                    const isSelf = !leaderboardPreview.loading && entry.userId === authUser?.userId;
                    const label = leaderboardPreview.loading
                      ? "Loading..."
                      : isSelf
                        ? "You"
                        : entry.userId.slice(0, 8);
                    const score = leaderboardPreview.loading ? null : entry.score;
                    return (
                      <div
                        key={leaderboardPreview.loading ? `skeleton-${idx}` : entry.userId}
                        className={`grid grid-cols-[60px_1fr_100px] items-center px-4 py-3 text-sm ${isSelf ? "bg-emerald-50/80 text-emerald-900" : "bg-white text-slate-800"
                          }`}
                      >
                        <div className="font-semibold text-slate-500">{rank}</div>
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                            {leaderboardPreview.loading ? "…" : label.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{label}</p>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                              {leaderboardPreview.loading ? "Syncing" : isSelf ? "This is you" : "Campus"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-base font-semibold">
                          {leaderboardPreview.loading ? <span className="inline-block h-4 w-10 animate-pulse rounded bg-slate-100" /> : score?.toFixed(0)}
                        </div>
                      </div>
                    );
                  })}
                  {!leaderboardPreview.loading &&
                    authUser?.userId &&
                    leaderboardPreview.items.every((row) => row.userId !== authUser.userId) &&
                    activitySnapshot.error === null && (
                      <div className="grid grid-cols-[60px_1fr_100px] items-center bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
                        <div className="font-semibold text-slate-500">{activitySnapshot.loading ? "…" : "—"}</div>
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                            {activityLeaderboard.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">You</p>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-600">
                              {activitySnapshot.loading ? "Loading…" : "Your position"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-base font-semibold">
                          {activitySnapshot.loading ? <span className="inline-block h-4 w-10 animate-pulse rounded bg-emerald-100" /> : activityLeaderboard.wins.toFixed(0)}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activityPreviews.map((game) => {
                const highlight =
                  (game.key === "speed_typing" && hasTypingInvite) ||
                  (game.key === "story" && hasStoryInvite);
                return (
                  <Link
                    key={game.key}
                    href={game.href}
                    className="group relative flex flex-col overflow-hidden rounded-3xl border border-[#191b2c] bg-gradient-to-br from-[#1f2336] via-[#14182b] to-[#070910] text-white shadow-[0_25px_60px_rgba(7,9,16,0.55)] transition hover:-translate-y-1 hover:shadow-[0_35px_80px_rgba(7,9,16,0.65)]"
                  >
                    <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
                      <span className="flex gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                      </span>
                      <span>Preview</span>
                      {game.tag ? (
                        <span className="ml-auto rounded-full bg-white/10 px-3 py-0.5 text-[9px] tracking-[0.2em] text-white/80">
                          {game.tag}
                        </span>
                      ) : null}
                      {highlight ? (
                        <span className="rounded-full bg-emerald-500/90 px-3 py-0.5 text-[9px] font-semibold tracking-[0.2em] text-white shadow">
                          Session waiting
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="relative h-48 overflow-hidden"
                      style={
                        game.image
                          ? {
                            backgroundImage: `linear-gradient(120deg, rgba(255,255,255,0.05), rgba(6,7,15,0.92)), url(${game.image})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                          : undefined
                      }
                    >
                      {game.image ? <div className="absolute inset-0 bg-gradient-to-t from-[#04060f] via-transparent to-transparent" /> : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-3 px-5 py-5">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{game.title}</h3>
                        <p className="mt-1 text-sm text-white/70">{game.description}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-white/80">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 font-semibold text-white">You</span>
                        <span className="text-white/50">+</span>
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/20 font-semibold text-emerald-100">Friend</span>
                        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/15">
                          2 players
                        </span>
                      </div>
                      <div className="pt-1">
                        <span className="inline-flex w-full items-center justify-center rounded-xl bg-[#ff5f72] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#ff5f72]/30 transition group-hover:bg-[#ff4b61]">
                          {highlight ? "Join pending session" : "Open activity window"}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      }
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
            <Link href="/discovery" className="block group relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-purple-500 to-indigo-500 p-6 text-white shadow-lg transition hover:shadow-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.2),_transparent_50%)]" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-rose-100">New Feature</p>
                  <h2 className="mt-1 text-2xl font-bold">Student Connect</h2>
                  <p className="mt-2 max-w-md text-sm text-rose-50">
                    Find students from other campuses. Find study partners or new friends.
                  </p>
                </div>
                <div className="hidden sm:block">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition group-hover:bg-white/30">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-base uppercase tracking-[0.35em] text-rose-500">People nearby</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">Who is within your discovery range</h2>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleToggleLive}
                    disabled={isActivating}
                    className={`
                      relative w-full max-w-xl rounded-2xl px-5 py-4 text-base font-semibold text-white shadow transition-all duration-300
                      ${goLiveActive
                        ? "bg-emerald-500 hover:bg-emerald-600 animate-pulse"
                        : "bg-[#f05656] hover:bg-[#e14a4a] hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(240,86,86,0.5)]"
                      }
                      ${isActivating ? "scale-95 opacity-90 cursor-wait" : ""}
                    `}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {isActivating && <Loader2 className="h-5 w-5 animate-spin" />}
                      {isActivating ? "Activating..." : goLiveActive ? "Live Active" : "Go Live"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={openFilterModal}
                    className="w-full max-w-xl rounded-2xl border border-slate-200 px-5 py-4 text-base font-semibold text-slate-800 shadow hover:border-slate-400"
                  >
                    Refine discovery filters
                  </button>
                  {discoveryFiltersActive ? (
                    <p className="w-full max-w-xl text-xs text-slate-500">
                      Filters are active. Reset from the top banner or adjust here.
                    </p>
                  ) : (
                    <p className="w-full max-w-xl text-xs text-slate-500">Preview below is lightweight—open discovery for the full feed.</p>
                  )}
                </div>

                <div className="overflow-hidden rounded-3xl border border-slate-900/40 bg-gradient-to-br from-slate-900 via-rose-700 to-amber-400 p-5 text-white shadow-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">Preview deck</p>
                      <h3 className="text-xl font-semibold">Fresh faces</h3>
                      <p className="text-xs text-white/70">Tap through to see everyone.</p>
                    </div>
                    <Link
                      href="/discovery"
                      className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-white/25"
                    >
                      Discovery
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {discoveryPreviewList.slice(0, 3).map((person, idx) => {
                      const isLive = Boolean(discoverPresence?.[person.userId]?.online);
                      return (
                        <div
                          key={person.userId ?? `preview-${idx}`}
                          className="rounded-2xl bg-white/10 p-4 backdrop-blur-md transition hover:-translate-y-1 hover:bg-white/15"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
                                {person.name.slice(0, 1).toUpperCase()}
                              </div>
                              <span
                                className={`absolute -right-1 -bottom-1 h-3 w-3 rounded-full ${isLive ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]" : "bg-white/40"
                                  }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">{person.name}</p>
                              <p className="truncate text-xs text-white/70">{person.detail}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-white/70">
                            <span className="rounded-full bg-white/10 px-3 py-1">{person.major}</span>
                            <span className="rounded-full bg-white/10 px-3 py-1">{person.year}</span>
                          </div>
                        </div>
                      );
                    })}
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
                      <label className="text-xs uppercase tracking-[0.25em] text-slate-500" htmlFor={majorFilterId}>
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
        );
    }
  };
  return (
    <main className="min-h-screen bg-gradient-to-r from-white via-rose-50 to-white text-base md:text-lg">
      <div className="flex min-h-screen w-full gap-8 px-0">
        <aside className="flex w-64 flex-col border-r border-rose-100 bg-white/90 px-4 py-8 text-slate-700 shadow-xl">
          <div className="flex items-center gap-3 rounded-2xl bg-white/95 px-3 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-rose-500 shadow-sm ring-1 ring-rose-100">
            <BrandLogo className="flex" logoClassName="h-36 w-auto" logoWidth={160} logoHeight={160} withWordmark />
          </div>
          <nav aria-label="Primary" className="mt-6 flex flex-col gap-1.5">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item.key)}
                aria-current={activeSection === item.key ? "page" : undefined}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm md:text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f05656] ${activeSection === item.key ? "bg-[#f05656] text-white shadow-lg" : "text-slate-700 hover:bg-rose-50"
                  }`}
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.badge ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${activeSection === item.key ? "bg-white/20 text-white" : "bg-slate-900 text-white"
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
                  Join Campus
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

