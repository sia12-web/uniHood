/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CheckCircle2, Loader2, Calendar } from "lucide-react";

import { useDeferredFeatures } from "@/components/providers/deferred-features-provider";
import { useCampuses } from "@/components/providers/campus-provider";
import SiteFooter from "@/components/SiteFooter";
import { usePresence } from "@/hooks/presence/use-presence";
import { useMeetupNotifications } from "@/hooks/use-meetup-notifications";
import { fetchDiscoveryFeed } from "@/lib/discovery";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { fetchFriends } from "@/lib/social";
import { listMeetups, type MeetupResponse } from "@/lib/meetups";
import type { FriendRow } from "@/lib/types";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { useActivitySnapshot } from "@/hooks/use-activity-snapshot";

const iconClassName = "h-4 w-4 flex-none";

const ActivityIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={iconClassName} aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
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

const DiscoveryFeed = dynamic(() => import("@/components/DiscoveryFeed"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  ),
});

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

const HERO_GRADIENTS = [
  "bg-gradient-to-r from-rose-500 via-rose-600 to-pink-600",
  "bg-gradient-to-r from-violet-500 via-purple-600 to-indigo-600",
  "bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600",
  "bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600",
  "bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600",
];

export default function HomePage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [heroGradientIndex, setHeroGradientIndex] = useState(0);

  const activitySnapshot = useActivitySnapshot();

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

  const [cardIndex, setCardIndex] = useState(0);

  const [recentFriends, setRecentFriends] = useState<FriendRow[]>([]);
  const [allFriends, setAllFriends] = useState<FriendRow[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [recentMeetups, setRecentMeetups] = useState<MeetupResponse[]>([]);
  const [joinedMeetups, setJoinedMeetups] = useState<MeetupResponse[]>([]);
  const [meetupsLoading, setMeetupsLoading] = useState(true);

  // Meetup notifications (unused directly here, but keeps hook active)
  const { } = useMeetupNotifications();

  // Use deferred features for heavy hooks (chat, social) to reduce TBT
  const {
    inboundPending,
    chatRosterEntries,
  } = useDeferredFeatures();

  useEffect(() => {
    const hydrate = () => {
      setAuthUser(readAuthUser());
      setAuthHydrated(true);
    };
    hydrate();
    const unsubscribe = onAuthChange(hydrate);
    return () => unsubscribe();
  }, []);

  const [discoverPeople, setDiscoverPeople] = useState<FriendPreview[]>([]);
  const rosterPeerIds = useMemo(() => chatRosterEntries.map((entry) => entry.peerId), [chatRosterEntries]);
  const discoverPeerIds = useMemo(() => discoverPeople.map((p) => p.userId), [discoverPeople]);
  const recentFriendPeerIds = useMemo(() => allFriends.map((row) => row.friend_id), [allFriends]);
  const { presence: discoverPresence } = usePresence(discoverPeerIds);

  const { getCampus } = useCampuses();

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
            (campusId ? getCampus(campusId)?.name : undefined);
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
  }, [authUser?.campusId, authUser?.userId, getCampus]);

  useEffect(() => {
    const loadFriends = async () => {
      if (!authUser?.userId || !authUser?.campusId) return;
      try {
        const friends = await fetchFriends(authUser.userId, authUser.campusId, "accepted");
        setFriendCount(friends.length);
        setAllFriends(friends);
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
  }, [authHydrated, authUser?.campusId, authUser?.userId]);

  type ActivityItem =
    | { type: "friend"; date: Date; id: string; data: FriendRow }
    | { type: "meetup"; date: Date; id: string; data: MeetupResponse; action: "joined" | "created" };

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

    // Add joined meetups (excluding ones user created)
    joinedMeetups
      .filter(m => m.creator_user_id !== authUser?.userId)
      .forEach(m => {
        activities.push({
          type: 'meetup',
          date: new Date(m.created_at),
          id: `meetup-joined-${m.id}`,
          data: m,
          action: 'joined'
        });
      });

    // Add created meetups
    recentMeetups.forEach(m => {
      activities.push({
        type: 'meetup',
        date: new Date(m.created_at),
        id: `meetup-created-${m.id}`,
        data: m,
        action: 'created'
      });
    });

    return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  }, [recentFriends, joinedMeetups, authUser?.userId, recentMeetups]);

  const friendPreviewList = useMemo(() => discoverPeople, [discoverPeople]);
  const visibleFriendPreviewList = useMemo(() => friendPreviewList, [friendPreviewList]);
  const discoveryPreviewList = useMemo<FriendPreview[]>(() => {
    return visibleFriendPreviewList.slice(0, 4).map((p) => ({
      ...p,
      status: discoverPresence[p.userId]?.online ? "Online" : "Offline",
    }));
  }, [visibleFriendPreviewList, discoverPresence]);

  useEffect(() => {
    if (cardIndex >= visibleFriendPreviewList.length) {
      setCardIndex(Math.max(visibleFriendPreviewList.length - 1, 0));
    }
  }, [visibleFriendPreviewList.length, cardIndex]);

  // Helper to check if a name is a default user_* pattern
  const isDefaultName = (name?: string) => name && (name.startsWith("user_") || name === authUser?.userId);
  const welcomeName = (!isDefaultName(authUser?.displayName) && authUser?.displayName)
    || (!isDefaultName(authUser?.handle) && authUser?.handle)
    || "Student";

  return (
    <main className="min-h-screen bg-gradient-to-r from-white via-rose-50 to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-base md:text-lg">
      <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-12 pb-24 space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Welcome{" "}
              <Link
                href="/settings/profile"
                className="text-rose-600 hover:text-rose-700 hover:underline decoration-2 underline-offset-4 transition-colors"
                title="Edit Profile"
              >
                {welcomeName}
              </Link>
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
                  {activitySnapshot.loading ? "..." : activitySnapshot.available ? activitySnapshot.socialScore : "—"}
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
          <Link
            href="/friends"
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
          </Link>

          {/* Games Played Stat */}
          <Link
            href="/games"
            className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md group text-left w-full"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Games Played</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {activitySnapshot.loading ? "..." : activitySnapshot.available ? activitySnapshot.totalGames : "—"}
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
                {!activitySnapshot.available
                  ? "Sign in to track stats"
                  : activitySnapshot.wins > 0
                    ? `${activitySnapshot.wins} wins`
                    : "Play to earn points"}
              </span>
            </div>
          </Link>
        </div>

        {/* Leaderboard Preview */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LeaderboardPreview />

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
                <div key={person.userId} className="flex flex-col items-center gap-2 min-w-[72px]">
                  <div className={`relative h-16 w-16 rounded-full p-[3px] bg-gradient-to-tr ${person.status === "Online" ? "from-rose-400 to-amber-400" : "from-slate-200 to-slate-300"}`}>
                    <div className="h-full w-full rounded-full bg-white p-1">
                      <div className="h-full w-full rounded-full bg-slate-100 overflow-hidden">
                        <img
                          src={person.imageUrl || ""}
                          alt={person.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 truncate w-16 text-center">{person.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

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
                  const isCreated = (item as { action?: string }).action === 'created';
                  return (
                    <div key={item.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${isCreated
                        ? 'bg-violet-100 text-violet-600'
                        : 'bg-indigo-100 text-indigo-600'
                        }`}>
                        <Calendar className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {isCreated ? 'Created Meetup' : 'Joined Meetup'}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          You {isCreated ? 'created' : 'joined'} <span className="font-medium text-slate-700">{meetup.title}</span>
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
      <SiteFooter />
    </main>
  );
}
