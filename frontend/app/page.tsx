/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CheckCircle2, Loader2, Calendar, Trophy, Gamepad2, Crown, Flame } from "lucide-react";

import Image from "next/image";
import { useStoryInviteState } from "@/components/providers/story-invite-provider";
import { useTypingDuelInviteState } from "@/components/providers/typing-duel-invite-provider";
import { useDeferredFeatures } from "@/components/providers/deferred-features-provider";
import { usePresence } from "@/hooks/presence/use-presence";
import { fetchDiscoveryFeed } from "@/lib/discovery";
import { fetchMySummary } from "@/lib/leaderboards";
import { listCampuses } from "@/lib/identity";
import { clearAuthSnapshot, onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { fetchFriends } from "@/lib/social";
import { listMeetups, type MeetupResponse } from "@/lib/meetups";
import type { FriendRow } from "@/lib/types";

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

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <circle cx="12" cy="7" r="4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
  </svg>
);

// HeartIcon removed (unused)
const BrandLogo = dynamic(() => import("@/components/BrandLogo"), {
  loading: () => (
    <span className="text-2xl font-black tracking-tight text-[#b7222d]">Divan</span>
  ),
});

const ProfileSettingsInline = dynamic(
  () => import("@/components/ProfileSettingsEmbed"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 text-sm text-slate-600 shadow-sm">
        Loading profile...
      </div>
    ),
  },
);

const DiscoveryFeed = dynamic(() => import("@/components/DiscoveryFeed"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  ),
});

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
  {
    key: "tictactoe",
    title: "Tic Tac Toe",
    description: "The classic game of X's and O's. Challenge a friend.",
    href: "/activities/tictactoe",
    tag: "Classic",
    image: "/activities/tictactoe.svg",
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

const HERO_GRADIENTS = [
  "bg-gradient-to-r from-rose-500 via-rose-600 to-pink-600",
  "bg-gradient-to-r from-violet-500 via-purple-600 to-indigo-600",
  "bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600",
  "bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600",
  "bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600",
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

type NavKey = "dashboard" | "network" | "games" | "profile" | "discovery" | "meetups" | "friends";
const NAV_SECTIONS: NavKey[] = ["dashboard", "network", "games", "profile", "discovery", "meetups"];
export default function HomePage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [activeSection, setActiveSection] = useState<NavKey>("dashboard");
  const [heroGradientIndex, setHeroGradientIndex] = useState(0);

  useEffect(() => {
    const updateGradient = () => {
      const minutes = Math.floor(Date.now() / 1000 / 60);
      const index = Math.floor(minutes / 5) % HERO_GRADIENTS.length;
      setHeroGradientIndex(index);
    };

    updateGradient();
    const interval = setInterval(updateGradient, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  // Restore active section from localStorage after hydration
  useEffect(() => {
    const savedSection = window.localStorage.getItem("divan.home.activeSection") as NavKey | null;
    const savedUser = window.localStorage.getItem("divan.home.activeSectionUser") ?? "";
    const auth = readAuthUser();
    if (auth?.userId && savedUser === auth.userId && savedSection && NAV_SECTIONS.includes(savedSection)) {
      setActiveSection(savedSection);
    }
  }, []);

  const persistActiveSection = useCallback((section: NavKey, userId?: string | null) => {
    setActiveSection(section);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("divan.home.activeSection", section);
      window.localStorage.setItem("divan.home.activeSectionUser", userId ?? "");
    }
  }, []);

  const [cardIndex, setCardIndex] = useState(0);

  const [recentFriends, setRecentFriends] = useState<FriendRow[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [recentMeetups, setRecentMeetups] = useState<MeetupResponse[]>([]);
  const [joinedMeetups, setJoinedMeetups] = useState<MeetupResponse[]>([]);
  const [meetupsLoading, setMeetupsLoading] = useState(true);

  // Use deferred features for heavy hooks (chat, social) to reduce TBT
  const {
    inboundPending,
    hasFriendAcceptanceNotification,
    chatUnreadCount,
    chatRosterEntries,
    chatRosterLoading,
  } = useDeferredFeatures();

  const { hasPending: hasStoryInvite } = useStoryInviteState();
  const { hasPending: hasTypingInvite } = useTypingDuelInviteState();

  const hasFriendsNotification = hasFriendAcceptanceNotification || inboundPending > 0;

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
    if (!authHydrated) return;
    persistActiveSection("dashboard", authUser?.userId ?? null);
  }, [authUser?.userId, authHydrated, persistActiveSection]);

  useEffect(() => {
    let cancelled = false;
    const loadCampuses = async () => {
      try {
        const rows = await listCampuses();
        if (!cancelled) {
          const map = rows.reduce<Record<string, string>>((acc, campus) => {
            if (campus.id && campus.name) {
              acc[campus.id] = campus.name;
            }
            return acc;
          }, {});
          setCampusNames(map);
        }
      } catch {
        // Non-blocking; default labels will be used if campus lookup fails.
      }
    };
    void loadCampuses();
    return () => {
      cancelled = true;
    };
  }, []);



  const [discoverPeople, setDiscoverPeople] = useState<FriendPreview[]>([]);
  const rosterPeerIds = useMemo(() => chatRosterEntries.map((entry) => entry.peerId), [chatRosterEntries]);
  const discoverPeerIds = useMemo(() => discoverPeople.map((p) => p.userId), [discoverPeople]);
  const recentFriendPeerIds = useMemo(() => recentFriends.map((row) => row.friend_id), [recentFriends]);
  const { presence: rosterPresence } = usePresence(rosterPeerIds);
  const { presence: discoverPresence } = usePresence(discoverPeerIds);
  const { presence: recentFriendsPresence } = usePresence(recentFriendPeerIds);
  const [campusNames, setCampusNames] = useState<Record<string, string>>({});

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
          const rawName = (raw.display_name || raw.handle || "").toString().trim();
          const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawName);
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
          const campusName =
            (raw as { campus_name?: string | null }).campus_name ??
            (campusId ? campusNames[campusId] : undefined);
          const campusLabel =
            campusName ??
            (campusId && authUser?.campusId && campusId === authUser.campusId ? "Your campus" : "Campus peer");
          const isFriend = Boolean((raw as { is_friend?: boolean }).is_friend);
          const isFriendOfFriend = Boolean((raw as { is_friend_of_friend?: boolean }).is_friend_of_friend);
          const year = normalizeYear(graduationYear ? String(graduationYear) : undefined);
          return {
            userId: raw.user_id,
            name: uuidLike ? raw.handle || "Classmate" : rawName || raw.handle || "Classmate",
            detail: raw.handle ? `@${raw.handle}` : passions[0] ?? "Nearby classmate",
            status: isFriend ? "Online" : "Away",
            major: raw.major ?? "Undeclared",
            year: year === "all" ? "freshman" : year,
            campus: campusLabel,
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
          setDiscoverPeople(mapped.filter((p) => !!p.imageUrl));
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
  }, [authUser?.campusId, authUser?.userId, campusNames]);

  const [activitySnapshot, setActivitySnapshot] = useState<{
    totalGames: number;
    wins: number;
    streak: number;
    socialScore: number;
    rank: number | null;
    loading: boolean;
    error: string | null;
  }>({
    totalGames: 0,
    wins: 0,
    streak: 0,
    socialScore: 0,
    rank: null,
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
        // Use raw counts if available, otherwise fallback to scores (which are weighted)
        const totalGames = summary.counts?.games_played ?? Math.max(0, Math.round(summary.scores.engagement ?? 0));
        const wins = summary.counts?.wins ?? Math.max(0, Math.round(summary.scores.overall ?? 0));
        const streak = Math.max(0, summary.streak?.current ?? 0);
        const socialScore = Math.max(0, Math.round(summary.scores.social ?? 0));
        const rank = summary.ranks.overall ?? null;
        setActivitySnapshot({ totalGames, wins, streak, socialScore, rank, loading: false, error: null });
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
    const loadFriends = async () => {
      if (!authUser?.userId || !authUser?.campusId) return;
      try {
        const friends = await fetchFriends(authUser.userId, authUser.campusId, "accepted");
        setFriendCount(friends.length);
        // Sort by created_at desc
        const sorted = friends.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentFriends(sorted.slice(0, 5));
      } catch (err) {
        console.error("Failed to load recent friends", err);
      }
    };
    if (authHydrated) {
      void loadFriends();
    }
  }, [authHydrated, authUser?.campusId, authUser?.userId]);

  useEffect(() => {
    const loadMeetups = async () => {
      if (!authUser?.campusId || !authUser?.userId) {
        setMeetupsLoading(false);
        return;
      }
      try {
        const data = await listMeetups(authUser.campusId);

        // For Recent Activity: joined meetups
        const joined = data.filter(m => m.is_joined);
        setJoinedMeetups(joined);

        // Filter for user's own meetups (created by them) - upcoming/active
        const myMeetups = data
          .filter(m => m.creator_user_id === authUser.userId && (m.status === "ACTIVE" || m.status === "UPCOMING"))
          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
          .slice(0, 3);
        setRecentMeetups(myMeetups);
      } catch (err) {
        console.error("Failed to load meetups", err);
      } finally {
        setMeetupsLoading(false);
      }
    };
    if (authHydrated) {
      void loadMeetups();
    }
  }, [authHydrated, authUser?.campusId]);



  type ActivityItem =
    | { type: "friend"; date: Date; id: string; data: FriendRow }
    | { type: "meetup"; date: Date; id: string; data: MeetupResponse };

  const combinedActivity = useMemo<ActivityItem[]>(() => {
    const activities: ActivityItem[] = [];

    recentFriends.forEach(f => {
      activities.push({
        type: 'friend',
        date: new Date(f.created_at),
        id: `friend-${f.friend_id}`,
        data: f
      });
    });

    joinedMeetups.forEach(m => {
      activities.push({
        type: 'meetup',
        date: new Date(m.created_at),
        id: `meetup-${m.id}`,
        data: m
      });
    });

    return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  }, [recentFriends, joinedMeetups]);

  const friendPreviewList = useMemo(() => discoverPeople, [discoverPeople]);


  const visibleFriendPreviewList = useMemo(() => friendPreviewList, [friendPreviewList]);
  const discoveryPreviewList = useMemo<FriendPreview[]>(() => {
    return visibleFriendPreviewList.slice(0, 4).map((p) => ({
      ...p,
      status: discoverPresence[p.userId]?.online ? "Online" : "Offline",
    }));
  }, [visibleFriendPreviewList, discoverPresence]);


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





  const navItems = useMemo(
    () => [
      { key: "dashboard" as const, label: "Dashboard", icon: <DiscoveryIcon />, badge: null },
      {
        key: "network" as const,
        label: "Network",
        icon: <UsersIcon />,
        badge: (hasFriendsNotification || chatUnreadCount > 0) ? "New" : null,
      },
      {
        key: "games" as const,
        label: "Games",
        icon: <ActivityIcon />,
        badge: hasStoryInvite || hasTypingInvite ? "Live" : null,
      },
      {
        key: "profile" as const,
        label: "Profile",
        icon: <ProfileIcon />,
        badge: null,
      },
    ],
    [hasFriendsNotification, chatUnreadCount, hasStoryInvite, hasTypingInvite],
  );

  const handleNavClick = (key: NavKey) => {
    if (key === "meetups") {
      router.push("/meetups");
      return;
    }
    if (key === "friends") {
      router.push("/friends");
      return;
    }
    persistActiveSection(key, authUser?.userId ?? null);
  };
  const renderSection = () => {
    switch (activeSection) {
      case "dashboard":
        return (
          <div className="space-y-8">
            {/* Header */}
            <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Welcome back,{" "}
                  <button
                    type="button"
                    onClick={() => handleNavClick("profile")}
                    className="text-rose-600 hover:text-rose-700 hover:underline decoration-2 underline-offset-4 transition-colors"
                  >
                    {authUser?.displayName || "Student"}
                  </button>
                </h1>
                <p className="text-slate-600">Here&apos;s your campus snapshot for today.</p>
              </div>
            </header>

            {/* Social Score Hero Card */}
            <section className={`relative overflow-hidden rounded-3xl ${HERO_GRADIENTS[heroGradientIndex]} p-8 shadow-xl transition-colors duration-1000`}>
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzMiAyIDIgNC0yIDQtMiA0LTItMi0yLTR6bS0xMiAwYzAtMiAyLTQgMi00czIgMiAyIDQtMiA0LTIgNC0yLTItMi00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
              <div className="absolute top-0 right-0 -mt-8 -mr-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg ring-2 ring-white/30">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-white">
                      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-rose-100 uppercase tracking-wider">Your Social Score</p>
                    <p className="mt-1 text-5xl font-black text-white tracking-tight">
                      {activitySnapshot.loading ? "..." : activitySnapshot.socialScore}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-2 text-sm font-bold text-white shadow-lg">
                    <span className="text-lg">⭐</span>
                    <span>{activitySnapshot.socialScore >= 100 ? "Campus Star!" : activitySnapshot.socialScore >= 50 ? "Rising Star" : "New Explorer"}</span>
                  </div>
                  <p className="text-xs text-rose-200">
                    Earn points by playing, connecting & attending meetups
                  </p>
                </div>
              </div>
            </section>

            {/* Stats Overview Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Friends Stat */}
              <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Friends</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{friendCount}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                    <UsersIcon />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-600">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                      <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 11.586 15.293 7.293A1 1 0 0115 7h-3z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <span>Growing network</span>
                </div>
              </div>

              {/* Invites Stat */}
              <button
                onClick={() => handleNavClick("friends")}
                className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md text-left group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Pending Invites</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{inboundPending}</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full transition ${inboundPending > 0 ? "bg-amber-100 text-amber-600 animate-pulse" : "bg-slate-50 text-slate-400"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-4 text-xs font-medium text-slate-500 group-hover:text-rose-600 transition-colors">
                  {inboundPending > 0 ? "Review requests →" : "All caught up"}
                </div>
              </button>

              {/* Games Played Stat */}
              <Link
                href="/activities"
                className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Games Played</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {activitySnapshot.loading ? "..." : activitySnapshot.totalGames}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                    <ActivityIcon />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-indigo-600">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100">
                    🎮
                  </span>
                  <span className="group-hover:text-indigo-700 transition-colors">
                    {activitySnapshot.wins > 0 ? `${activitySnapshot.wins} wins` : "Play to earn points"}
                  </span>
                </div>
              </Link>
            </div>

            {/* Compact Live Discovery */}
            <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 via-white to-rose-50/50 p-6 shadow-sm transition-all hover:shadow-md hover:border-indigo-200">
              <div className="absolute top-0 right-0 -mt-16 -mr-16 h-40 w-40 rounded-full bg-gradient-to-br from-rose-400/20 to-amber-300/20 blur-3xl" />
              <div className="absolute bottom-0 left-0 -mb-16 -ml-16 h-40 w-40 rounded-full bg-gradient-to-tr from-indigo-400/20 to-emerald-300/20 blur-3xl" />

              <div className="relative z-10 flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Live on Campus
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">See who&apos;s active right now</p>
                </div>
                <Link href="/discovery" className="group flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-indigo-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-white hover:text-indigo-700 hover:ring-indigo-200">
                  View Map
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 transition-transform group-hover:translate-x-0.5">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
              <div className="relative z-10 flex gap-4 overflow-x-auto pb-2 scrollbar-hide mask-linear-fade">
                {/* Live Peers */}
                {discoveryPreviewList.map((person) => (
                  <div key={person.userId} className="flex flex-col items-center gap-2 min-w-[72px] cursor-pointer group">
                    <div className={`relative h-16 w-16 rounded-full p-[3px] bg-gradient-to-tr ${person.status === "Online" ? "from-rose-400 to-amber-400" : "from-slate-200 to-slate-300"}`}>
                      <div className="h-full w-full rounded-full bg-white p-1">
                        <div className="h-full w-full rounded-full bg-slate-100 overflow-hidden">
                          <img
                            src={person.imageUrl || ""}
                            alt={person.name}
                            className="h-full w-full object-cover transition group-hover:scale-110"
                          />
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-600 truncate w-16 text-center">{person.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Activity (Full Width) */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Recent Activity</h3>
              </div>
              <div className="space-y-4">
                {combinedActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-3">
                      <ActivityIcon />
                    </div>
                    <p className="text-sm text-slate-500">No recent activity.</p>
                    <p className="text-xs text-slate-400">Connect with friends or join meetups to see updates.</p>
                  </div>
                ) : (
                  combinedActivity.map((item) => {
                    if (item.type === 'friend') {
                      const friend = item.data as FriendRow;
                      return (
                        <div key={item.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition">
                          <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                            <CheckCircle2 className="h-6 w-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              New Connection
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              You are now friends with <span className="font-medium text-slate-700">{friend.friend_display_name || friend.friend_handle}</span>
                            </p>
                          </div>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {item.date.toLocaleDateString()}
                          </span>
                        </div>
                      );
                    } else if (item.type === 'meetup') {
                      const meetup = item.data as MeetupResponse;
                      return (
                        <div key={item.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition">
                          <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                            <Calendar className="h-6 w-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              Joined Meetup
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              You joined <span className="font-medium text-slate-700">{meetup.title}</span>
                            </p>
                          </div>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {item.date.toLocaleDateString()}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })
                )}
              </div>
            </section>
          </div>
        );
      case "network":
        return (
          <div className="space-y-8">
            <header>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">Network</h2>
              <p className="text-sm text-slate-500">Your social hub on campus.</p>
            </header>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Chats Card */}
              <div className="col-span-1 md:col-span-2 lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                      <ChatIcon />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Messages</h3>
                      <p className="text-xs text-slate-500">Recent conversations</p>
                    </div>
                  </div>
                  <Link href="/chat" className="text-sm font-semibold text-rose-600 hover:text-rose-700">
                    Open Inbox
                  </Link>
                </div>

                <div className="flex-1 space-y-4">
                  {chatRosterLoading ? (
                    <div className="space-y-3">
                      <div className="h-16 animate-pulse rounded-2xl bg-slate-50" />
                      <div className="h-16 animate-pulse rounded-2xl bg-slate-50" />
                    </div>
                  ) : chatPreviewCards.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {chatPreviewCards.slice(0, 4).map((chat) => (
                        <Link
                          key={chat.handle}
                          href="/chat"
                          className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-md hover:border-rose-100"
                        >
                          <div className="relative">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow-sm">
                              {chat.name.slice(0, 2).toUpperCase()}
                            </div>
                            {chat.status === "online" && (
                              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between">
                              <p className="truncate font-bold text-slate-900">{chat.name}</p>
                              {chat.unread ? (
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-slate-500">{chat.snippet}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-sm text-slate-400">No active chats.</p>
                      <Link href="/chat" className="mt-2 text-xs font-bold text-slate-900 hover:underline">Start a conversation</Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Friends Card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <UsersIcon />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Friends</h3>
                      <p className="text-xs text-slate-500">{friendCount} connections</p>
                    </div>
                  </div>
                  <Link href="/friends" className="text-sm font-semibold text-rose-600 hover:text-rose-700">
                    Manage
                  </Link>
                </div>

                <div className="flex-1 flex flex-col justify-center gap-4">
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                    <span className="text-sm font-medium text-slate-600">Online Now</span>
                    <span className="text-xl font-bold text-emerald-600">
                      {recentFriends.filter((f) => recentFriendsPresence[f.friend_id]?.online).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                    <span className="text-sm font-medium text-slate-600">Pending Requests</span>
                    <span className={`text-xl font-bold ${inboundPending > 0 ? "text-rose-600" : "text-slate-400"}`}>
                      {inboundPending}
                    </span>
                  </div>
                  <Link
                    href="/discovery"
                    className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
                  >
                    Find New Friends
                  </Link>
                </div>
              </div>

              {/* Meetups Card */}
              <div className="col-span-1 md:col-span-2 lg:col-span-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">My Meetups</h3>
                      <p className="text-xs text-slate-500">Events you&apos;re hosting</p>
                    </div>
                  </div>
                  <Link href="/meetups" className="text-sm font-semibold text-rose-600 hover:text-rose-700">
                    View All
                  </Link>
                </div>

                <div className="flex-1">
                  {meetupsLoading ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-50" />
                      ))}
                    </div>
                  ) : recentMeetups.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {recentMeetups.map((meetup) => {
                        const date = new Date(meetup.start_at);
                        const isToday = date.toDateString() === new Date().toDateString();
                        const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                        const dateStr = isToday ? "Today" : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                        return (
                          <Link
                            key={meetup.id}
                            href={`/meetups/${meetup.id}`}
                            className="group flex flex-col justify-between rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white p-4 transition hover:shadow-md hover:border-indigo-300 ring-1 ring-indigo-100"
                          >
                            <div>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                    HOST
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meetup.category === 'study' ? 'bg-blue-100 text-blue-700' :
                                    meetup.category === 'social' ? 'bg-rose-100 text-rose-700' :
                                      meetup.category === 'game' ? 'bg-purple-100 text-purple-700' :
                                        'bg-slate-100 text-slate-700'
                                    }`}>
                                    {meetup.category}
                                  </span>
                                </div>
                                {meetup.status === "ACTIVE" && (
                                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                )}
                              </div>
                              <h4 className="mt-2 font-bold text-slate-900 line-clamp-1 group-hover:text-indigo-600">{meetup.title}</h4>
                              <p className="mt-1 text-xs text-slate-500 line-clamp-2">{meetup.description || "No description"}</p>
                            </div>
                            <div className="mt-4 flex items-center gap-3 text-xs font-medium text-slate-400">
                              <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                  <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                                </svg>
                                {dateStr} • {timeStr}
                              </div>
                              <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.358-.442 3 3 0 00-4.308-3.516 6.484 6.484 0 011.905 3.959c.023.222.014.442-.025.654zM9 12a4 4 0 014 4v.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5V16a4 4 0 014-4z" />
                                </svg>
                                {meetup.participants_count}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                      <div className="mb-3 rounded-full bg-indigo-50 p-3 text-indigo-500">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">No meetups yet</h3>
                      <p className="mt-1 text-xs text-slate-500 max-w-xs">
                        You haven&apos;t created any meetups. Host a study group or hangout!
                      </p>
                      <Link
                        href="/meetups"
                        className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                      >
                        Create Meetup
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case "games": {

        return (
          <div className="space-y-8">
            {/* Header */}
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Play Games</h1>
              <p className="text-slate-600">Play games and challenge yourself with friends.</p>
            </div>

            {/* Stats Card */}
            <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-8 text-white shadow-xl ring-1 ring-slate-900/5">
              {/* Background Effects */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-rose-500/10" />
              <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-rose-500/20 blur-3xl" />

              <div className="relative z-10 grid grid-cols-2 gap-8 md:grid-cols-4">
                {/* Game Points */}
                <div className="flex flex-col gap-1">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-400">Game Points</span>
                  <span className="text-3xl font-bold tracking-tight text-white">
                    {activitySnapshot.loading ? "-" : (activitySnapshot.totalGames * 50) + (activitySnapshot.wins * 150)}
                  </span>
                </div>

                {/* Games Played */}
                <div className="flex flex-col gap-1">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/40">
                    <Gamepad2 className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-400">Games Played</span>
                  <span className="text-3xl font-bold tracking-tight text-white">
                    {activitySnapshot.loading ? "-" : activitySnapshot.totalGames}
                  </span>
                </div>

                {/* Wins */}
                <div className="flex flex-col gap-1">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
                    <Crown className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-400">Wins</span>
                  <span className="text-3xl font-bold tracking-tight text-white">
                    {activitySnapshot.loading ? "-" : activitySnapshot.wins}
                  </span>
                </div>

                {/* Streak */}
                <div className="flex flex-col gap-1">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40">
                    <Flame className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-400">Streak</span>
                  <span className="text-3xl font-bold tracking-tight text-white">
                    {activitySnapshot.loading ? "-" : activitySnapshot.streak}
                  </span>
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
                          {highlight ? "Join pending session" : "Open game window"}
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
      case "profile":
        return (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-xl">
            <ProfileSettingsInline />
          </div>
        );
      case "discovery":
        return (
          <div className="-mx-6 -my-12 md:-mx-10">
            <DiscoveryFeed />
          </div>
        );

    }
  };
  return (
    <main className="min-h-screen bg-gradient-to-r from-white via-rose-50 to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-base md:text-lg">
      <div className="flex min-h-screen w-full gap-8 px-0">
        <aside className="flex w-64 flex-col border-r border-rose-100 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 py-8 text-slate-700 dark:text-slate-300 shadow-xl">
          <div className="flex items-center gap-3 rounded-2xl bg-white/95 px-3 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-rose-500 shadow-sm ring-1 ring-rose-100 overflow-hidden">
            <BrandLogo
              className="flex-shrink-0"
              logoClassName="!h-24 w-auto"
              backgroundTone="transparent"
              logoWidth={120}
              logoHeight={120}
            />
            <span className="h-10 w-px flex-shrink-0 bg-rose-200" aria-hidden />
            <div className="flex flex-shrink-0 items-center">
              <Image
                src="/university-logos/mcgill.svg"
                alt="McGill University"
                width={56}
                height={56}
                className="h-14 w-auto rounded-lg object-contain"
                priority
              />
            </div>
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
