/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";


import { useDeferredFeatures } from "@/components/providers/deferred-features-provider";
import { useCampuses } from "@/components/providers/campus-provider";
import SiteFooter from "@/components/SiteFooter";
import { usePresence } from "@/hooks/presence/use-presence";
import { useMeetupNotifications } from "@/hooks/use-meetup-notifications";
import { fetchDiscoveryFeed } from "@/lib/discovery";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { fetchFriends, fetchInviteInbox, acceptInvite } from "@/lib/social";
import { listMeetups, type MeetupResponse } from "@/lib/meetups";
import type { FriendRow, InviteSummary } from "@/lib/types";
import { LeaderboardPreview } from "@/components/LeaderboardPreview";
import { useActivitySnapshot } from "@/hooks/use-activity-snapshot";



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



  const [recentFriends, setRecentFriends] = useState<FriendRow[]>([]);
  const [, setAllFriends] = useState<FriendRow[]>([]);

  const [recentMeetups, setRecentMeetups] = useState<MeetupResponse[]>([]);
  const [joinedMeetups, setJoinedMeetups] = useState<MeetupResponse[]>([]);
  const [, setMeetupsLoading] = useState(true);
  const [connectionsTab, setConnectionsTab] = useState<"online" | "invites">("online");
  const [pendingInvites, setPendingInvites] = useState<InviteSummary[]>([]);

  // Meetup notifications (unused directly here, but keeps hook active)
  const { } = useMeetupNotifications();

  // Use deferred features for heavy hooks (chat, social) to reduce TBT
  const {
    inboundPending,
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
  const discoverPeerIds = useMemo(() => discoverPeople.map((p) => p.userId), [discoverPeople]);
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

  useEffect(() => {
    const loadInvites = async () => {
      if (!authUser?.userId || !authUser?.campusId) return;
      try {
        const inbox = await fetchInviteInbox(authUser.userId, authUser.campusId);
        // Filter for 'sent' status (pending)
        setPendingInvites(inbox.filter(i => i.status === "sent"));
      } catch (err) {
        console.error("Failed to load invites", err);
      }
    };
    if (authHydrated) {
      void loadInvites();
    }
  }, [authHydrated, authUser?.campusId, authUser?.userId]);

  const handleAcceptInvite = async (inviteId: string) => {
    if (!authUser?.userId || !authUser?.campusId) return;
    try {
      await acceptInvite(authUser.userId, authUser.campusId, inviteId);
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      // Refresh friends list if needed, or let standard revalidation handle it
    } catch (err) {
      console.error("Failed to accept invite", err);
    }
  };

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

  const discoveryPreviewList = useMemo<FriendPreview[]>(() => {
    return discoverPeople.slice(0, 8).map((p) => ({
      ...p,
      status: discoverPresence[p.userId]?.online ? "Online" : "Away", // improved status logic
    }));
  }, [discoverPeople, discoverPresence]);


  // Helper to check if a name is a default user_* pattern
  const isDefaultName = (name?: string) => name && (name.startsWith("user_") || name === authUser?.userId);
  const welcomeName = (!isDefaultName(authUser?.displayName) && authUser?.displayName)
    || (!isDefaultName(authUser?.handle) && authUser?.handle)
    || "Student";



  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-base md:text-lg pb-12">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Good afternoon,{" "}
              <Link
                href="/settings/profile"
                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                title="Edit Profile"
              >
                {welcomeName}
              </Link>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base">
              Campus is buzzing. <span className="font-semibold text-emerald-600 dark:text-emerald-400">{discoverPeople.filter(p => p.status === 'Online').length} students online.</span>
            </p>
          </div>

        </header>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* LEFT COLUMN (Main Content) */}
          <div className="lg:col-span-8 space-y-6">

            {/* 1. Live on Campus (Carousel) */}
            <section className="relative overflow-hidden rounded-3xl border border-indigo-100 dark:border-indigo-900/50 bg-white dark:bg-slate-900 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Live on Campus
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                    </span>
                  </h2>
                </div>
                <Link href="/socials" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1">
                  View Map
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide mask-linear-fade">
                {discoveryPreviewList.length === 0 ? (
                  <div className="w-full text-center py-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">Everyone is quiet right now...</p>
                  </div>
                ) : (
                  discoveryPreviewList.map((person) => (
                    <div key={person.userId} className="group relative flex flex-col items-center gap-3 min-w-[100px] flex-shrink-0 transition transform">
                      <div className={`relative h-20 w-20 rounded-full p-[3px] bg-gradient-to-tr ${person.status === "Online" ? "from-rose-400 to-amber-400" : "from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600"}`}>
                        <div className="h-full w-full rounded-full bg-white dark:bg-slate-900 p-1">
                          <div className="h-full w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                            <img
                              src={person.imageUrl || ""}
                              alt={person.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </div>
                        {/* Status Badge */}
                        {person.status === "Online" && (
                          <div className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900"></div>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate w-24">{person.name.split(" ")[0]}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium truncate w-24">
                          {person.status === "Online" ? "Hanging Out" : "Away"}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 2. Recent Activity Timeline */}
              <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm h-full">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Recent Activity</h3>
                <div className="space-y-6 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100 dark:before:bg-slate-800">
                  {combinedActivity.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 pl-8">No recent activity.</p>
                  ) : (
                    combinedActivity.map((item) => {
                      // Render simplified logic for visual mockup matching
                      const isMeetup = item.type === 'meetup';
                      const time = item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                      return (
                        <div key={item.id} className="relative pl-10">
                          {/* Dot on timeline */}
                          <div className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${isMeetup ? "bg-indigo-500" : "bg-emerald-500"
                            }`}></div>

                          <div className="flex flex-col gap-1">
                            <p className="text-sm text-slate-900 dark:text-white">
                              {item.type === 'friend' ? (
                                <span>Added <span className="font-bold">{(item.data as FriendRow).friend_display_name}</span> as a friend</span>
                              ) : (
                                <span>
                                  {item.action === 'created' ? 'Created event' : 'Joined event'}{" "}
                                  <span className="font-bold">{(item.data as MeetupResponse).title}</span>
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                              <span>{time}</span>
                              <button className="hover:text-rose-500 transition-colors">
                                Like
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              {/* 3. Connections & Invites */}
              <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm h-full flex flex-col">
                <div className="flex items-center gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <button
                    onClick={() => setConnectionsTab("online")}
                    className={`text-sm font-bold pb-2 border-b-2 transition-colors ${connectionsTab === "online"
                      ? "border-rose-500 text-slate-900 dark:text-white"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                  >
                    Online Friends
                  </button>
                  <button
                    onClick={() => setConnectionsTab("invites")}
                    className={`text-sm font-bold pb-2 border-b-2 transition-colors ${connectionsTab === "invites"
                      ? "border-rose-500 text-slate-900 dark:text-white"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                  >
                    Invites {inboundPending > 0 && <span className="ml-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 text-[10px]">{inboundPending}</span>}
                  </button>
                  <Link href="/friends" className="ml-auto text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 pb-2">
                    Manage Friends
                  </Link>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[300px] scrollbar-hide space-y-4">
                  {connectionsTab === "online" ? (
                    <div className="space-y-4">
                      {/* Using recentFriends as mock for online friends list if specific online friend list is empty */}
                      {recentFriends.length === 0 ? (
                        <div className="text-center py-6">
                          <p className="text-sm text-slate-500">No friends online.</p>
                          <Link href="/socials" className="mt-2 block text-xs font-bold text-indigo-600">Find new people</Link>
                        </div>
                      ) : (
                        recentFriends.map(friend => (
                          <div key={friend.friend_id} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                                {friend.friend_display_name?.[0] || "?"}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">{friend.friend_display_name || "Friend"}</p>
                                <p className="text-xs text-emerald-500 font-medium">Online now</p>
                              </div>
                            </div>
                            <button className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">
                              Message
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (

                    <div className="space-y-4">
                      {pendingInvites.length === 0 ? (
                        <div className="text-center py-6 text-slate-500">
                          <p className="text-sm">No pending invites.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {pendingInvites.map((invite) => (
                            <div key={invite.id} className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="h-10 w-10 shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                                  {invite.from_display_name?.[0]?.toUpperCase() || "?"}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {invite.from_display_name || "Student"}
                                  </p>
                                  <p className="text-xs text-slate-500 truncate">
                                    {invite.from_handle ? `@${invite.from_handle}` : "Pending request"}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleAcceptInvite(invite.id)}
                                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all"
                              >
                                Accept
                              </button>
                            </div>
                          ))}
                          {pendingInvites.length > 3 && (
                            <Link href="/friends" className="block text-center text-xs font-bold text-indigo-600 pt-2 hover:underline">
                              View all {pendingInvites.length} requests
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* RIGHT COLUMN (Sidebar) */}
          <div className="lg:col-span-4 space-y-6">

            {/* 4. Social Score (Sidebar Version) */}
            <section className={`relative overflow-hidden rounded-3xl ${HERO_GRADIENTS[heroGradientIndex]} p-6 shadow-xl text-white`}>
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzMiAyIDIgNC0yIDQtMiA0LTItMiA0LTItMi00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-20" />

              <div className="relative z-10 flex flex-col items-center text-center">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white/80">Social Explorer</h2>

                <div className="my-6 relative">
                  <svg className="h-32 w-32 transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="60"
                      fill="transparent"
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="60"
                      fill="transparent"
                      stroke="white"
                      strokeWidth="8"
                      strokeDasharray={377}
                      strokeDashoffset={377 - (377 * (Math.min(activitySnapshot.socialScore, 100) / 100))}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black">{activitySnapshot.available ? Math.floor(activitySnapshot.socialScore) : "-"}</span>
                    <span className="text-xs font-medium text-white/80">Level {Math.floor(activitySnapshot.socialScore / 10) + 1}</span>
                  </div>
                </div>

                <div className="w-full rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <p className="text-xs font-medium">
                    {100 - (activitySnapshot.socialScore % 100)} points to next level
                  </p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
                    <div className="h-full bg-white rounded-full" style={{ width: `${activitySnapshot.socialScore % 100}%` }}></div>
                  </div>
                </div>
              </div>
            </section>

            {/* 5. Games & Stats */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your Stats</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-center">
                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    {activitySnapshot.available ? activitySnapshot.totalGames : "-"}
                  </p>
                  <p className="text-xs font-bold text-slate-500 uppercase">Games</p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-center">
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {activitySnapshot.available ? activitySnapshot.wins : "-"}
                  </p>
                  <p className="text-xs font-bold text-slate-500 uppercase">Wins</p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Top Players</h4>
                  <Link href="/leaderboards" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">View All</Link>
                </div>
                <LeaderboardPreview />
              </div>
            </div>

          </div>
        </div>

        <SiteFooter />
      </div >
    </main >
  );
}
