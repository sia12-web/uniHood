"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/http/client";
import { applyDiff } from "@/lib/diff";
import { emitInviteCountRefresh } from "@/hooks/social/use-invite-count";
import {
  onAuthChange,
  readAuthUser,
  type AuthUser,
} from "@/lib/auth-storage";
import {
  disconnectPresenceSocket,
  getPresenceSocket,
  initialiseNearbyAccumulator,
  applyNearbyEvent,
  nearbyAccumulatorToArray,
} from "@/lib/socket";
import { getOrCreateIdemKey } from "@/app/api/idempotency";
import { fetchFriends, fetchInviteOutbox, sendInvite } from "@/lib/social";
import { emitFriendshipFormed } from "@/lib/friends-events";
import { updateProfileLocation } from "@/lib/profiles";
import {
  LOCATION_PERMISSION_MESSAGE,
  requestBrowserPosition,
  sendHeartbeat,
} from "@/lib/presence/api";
import type { NearbyDiff, NearbyUser } from "@/lib/types";
import { Loader2, MapPin, Zap, Filter, ChevronDown, Users, Info, Home, GraduationCap, Building2, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfileDetailModal } from "@/components/ProfileDetailModal";
import { ParallaxProfileCard } from "@/components/ParallaxProfileCard";
import { DiscoveryFeedResponse } from "@/lib/types";
import { fetchProfile, fetchUserCourses } from "@/lib/identity";
import { Lock } from "lucide-react";

type DiscoveryFeedProps = {
  variant?: "full" | "mini";
};

// Discovery modes:
// - room: Live proximity within 100m (requires geolocation)
// - campus: All users with same campus_id (directory mode)
// - city: All users in the system (directory mode)
type DiscoveryMode = "room" | "campus" | "city";

const DISCOVERY_MODES: Array<{ label: string; mode: DiscoveryMode; emoji: string; description: string }> = [
  { label: "Room", mode: "room", emoji: "🏠", description: "Live nearby (100m)" },
  { label: "Campus", mode: "campus", emoji: "🎓", description: "Same university" },
  { label: "City", mode: "city", emoji: "🏙️", description: "Everyone" },
];

const POPULAR_MAJORS = [
  "Computer Science",
  "Psychology",
  "Economics",
  "Biology",
  "Engineering",
  "Business",
  "Political Science",
  "Neuroscience",
  "Arts",
  "Finance",
  "Marketing",
  "Mathematics"
];

type NearbyAccumulator<T> = {
  cursor: string | null;
  order: string[];
  entries: Map<string, T>;
};

// Config parallels /proximity page
const HEARTBEAT_VISIBLE_MS = 10000; // 10 seconds for better real-time Room mode discovery
const HEARTBEAT_HIDDEN_MS = 60000;  // 1 minute when tab is hidden
const GO_LIVE_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_GO_LIVE === "true";

function getYearLabel(gradYear: number): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = now.getMonth(); // 0-11
  // Academic year starts in August (7)
  const academicYearStart = month >= 7 ? currentYear : currentYear - 1;

  // Class of (academicYearStart + 1) is Senior
  // Class of (academicYearStart + 4) is Freshman

  const diff = gradYear - academicYearStart;
  if (diff >= 4) return "freshman";
  if (diff >= 1) return "undergrad"; // Covers Sophomore (3), Junior (2), Senior (1)
  return "grad";
}



async function fetchFeed(mode: DiscoveryMode = "campus", cursor?: string | null, limit: number = 10) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  params.set("mode", mode);

  // Set radius based on mode
  if (mode === "room") params.set("radius_m", "100");
  else if (mode === "campus") params.set("radius_m", "50000");
  else if (mode === "city") params.set("radius_m", "100000");

  try {
    const data = await apiFetch<DiscoveryFeedResponse>(`/discovery/feed?${params.toString()}`);
    return data;
  } catch (err) {
    console.error("Feed fetch failed", err);
    throw err;
  }
}

export default function DiscoveryFeed({ variant = "full" }: DiscoveryFeedProps) {
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>("campus"); // Default to campus
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authEvaluated, setAuthEvaluated] = useState(false);
  const [invitePendingId, setInvitePendingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [showProximityPrompt, setShowProximityPrompt] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [myCourses, setMyCourses] = useState<string[]>([]);

  // Filters
  const [filterMajor, setFilterMajor] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [userLevel, setUserLevel] = useState<number>(1);

  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const nearbyStateRef = useRef<NearbyAccumulator<NearbyUser> | null>(null);
  const usersRef = useRef<NearbyUser[]>([]);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const positionRef = useRef<GeolocationPosition | null>(null);
  const sentInitialHeartbeat = useRef(false);
  const router = useRouter();

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // 1. Level-based visibility: In Room mode, only show verified students for max safety
      if (discoveryMode === "room" && !u.is_university_verified) return false;

      // 2. Filter by Major
      if (filterMajor !== "all" && u.major !== filterMajor) return false;

      // 3. Filter by Year
      if (filterYear !== "all") {
        if (!u.graduation_year) return false;
        const label = getYearLabel(u.graduation_year);
        if (label !== filterYear) return false;
      }

      return true;
    });
  }, [users, filterMajor, filterYear, discoveryMode]);



  const uniqueMajors = useMemo(() => {
    const userMajors = users
      .map((u) => u.major)
      .filter((m): m is string => typeof m === "string" && m.length > 0 && m.toLowerCase() !== "none")
      .map((m) => m.trim());

    // Combine popular majors and user majors, removing duplicates
    const allMajors = new Set([...POPULAR_MAJORS, ...userMajors]);

    return Array.from(allMajors).sort();
  }, [users]);

  const currentUserId = authUser?.userId ?? null;
  const currentCampusId = authUser?.campusId ?? null;
  const goLiveAllowed = GO_LIVE_ENABLED && Boolean(currentUserId && currentCampusId);

  useEffect(() => {
    const unsubscribe = onAuthChange(() => {
      setAuthUser(readAuthUser());
      setAuthEvaluated(true);
    });
    setAuthUser(readAuthUser());
    setAuthEvaluated(true);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authUser && authUser.userId) {
      fetchUserCourses(authUser.userId, authUser.campusId)
        .then(courses => setMyCourses(courses.map(c => c.code || c.name || "").filter(Boolean)))
        .catch(err => console.error("Failed to fetch my courses", err));

      fetchProfile(authUser.userId, authUser.campusId)
        .then(profile => setUserLevel(profile.level))
        .catch(err => console.error("Failed to fetch level", err));
    } else {
      setMyCourses([]);
    }
  }, [authUser]);

  const loadFriends = useCallback(async () => {
    if (!authEvaluated || !currentUserId || !currentCampusId) {
      return;
    }
    try {
      const rows = await fetchFriends(currentUserId, currentCampusId, "accepted");
      setFriendIds(() => new Set(rows.map((row) => row.friend_id)));
    } catch {
      // ignored
    }
  }, [authEvaluated, currentCampusId, currentUserId]);

  const withFriendStatus = useCallback(
    (entries: NearbyUser[]): NearbyUser[] =>
      entries.map((entry) => {
        if (entry.is_friend || !friendIds.has(entry.user_id)) {
          return entry;
        }
        return { ...entry, is_friend: true };
      }),
    [friendIds],
  );

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const loadInvites = useCallback(async () => {
    if (!authEvaluated || !currentUserId || !currentCampusId) {
      return;
    }
    try {
      const pending = await fetchInviteOutbox(currentUserId, currentCampusId);
      // Filter for sent status just to be safe, though outbox usually implies active
      const ids = new Set(pending.filter((i) => i.status === "sent").map((i) => i.to_user_id));
      setInvitedIds(ids);
    } catch {
      // ignored
    }
  }, [authEvaluated, currentCampusId, currentUserId]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  useEffect(() => {
    nearbyStateRef.current = initialiseNearbyAccumulator<NearbyUser>();
    usersRef.current = [];
  }, [discoveryMode, currentCampusId]);

  // Socket lifecycle
  const socket = useMemo(() => {
    if (!authEvaluated || !currentUserId || !currentCampusId) {
      disconnectPresenceSocket();
      return null;
    }
    disconnectPresenceSocket();
    return getPresenceSocket(currentUserId, currentCampusId);
  }, [authEvaluated, currentUserId, currentCampusId]);

  useEffect(() => {
    if (!socket) return;

    // Only use socket for real-time updates in Room mode
    if (discoveryMode !== "room") return;

    nearbyStateRef.current = applyNearbyEvent(initialiseNearbyAccumulator<NearbyUser>(), {
      items: usersRef.current,
    });
    const handleUpdate = (payload: NearbyDiff) => {
      setUsers((prev) => {
        const next = applyDiff(prev, payload, 100); // Room mode is always 100m
        const patched = withFriendStatus(next);
        nearbyStateRef.current = applyNearbyEvent(initialiseNearbyAccumulator<NearbyUser>(), {
          items: patched,
        });
        usersRef.current = patched;
        return patched;
      });
    };
    const handleNearby = (payload: { cursor?: string | null; items?: NearbyUser[] }) => {
      const currentAcc = nearbyStateRef.current ?? initialiseNearbyAccumulator<NearbyUser>();
      const nextAcc = applyNearbyEvent(currentAcc, payload);
      nearbyStateRef.current = nextAcc;
      const ordered = nearbyAccumulatorToArray(nextAcc) as NearbyUser[];
      const patched = withFriendStatus(ordered);
      usersRef.current = patched;
      setUsers(patched);
    };
    socket.on("nearby:update", handleUpdate);
    socket.on("presence:nearby", handleNearby);
    socket.emit("nearby:subscribe", { campus_id: currentCampusId, radius_m: 100 });
    return () => {
      socket.off("nearby:update", handleUpdate);
      socket.off("presence:nearby", handleNearby);
      socket.emit("nearby:unsubscribe", { campus_id: currentCampusId, radius_m: 100 });
    };
  }, [socket, discoveryMode, currentCampusId, withFriendStatus]);

  useEffect(() => () => disconnectPresenceSocket(), []);

  const refreshNearby = useCallback(async () => {
    if (!authEvaluated || !currentUserId || !currentCampusId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Use the new Discovery Feed endpoint for social-first discovery
      const response = await fetchFeed(discoveryMode);
      const items = response.items || [];
      const patched = withFriendStatus(items);
      setUsers(patched);
      usersRef.current = patched;
      nearbyStateRef.current = applyNearbyEvent(initialiseNearbyAccumulator<NearbyUser>(), {
        items: patched,
      });
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load discovery feed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [authEvaluated, currentCampusId, currentUserId, discoveryMode, withFriendStatus]);



  // Initial Load
  useEffect(() => {
    if (authEvaluated) {
      void refreshNearby();
    }
  }, [authEvaluated, refreshNearby]);

  // Auto-Heartbeat Logic (only for Room mode - live proximity)
  const sendHeartbeatSafe = useCallback(async () => {
    if (!authEvaluated || !goLiveAllowed || !currentUserId || !currentCampusId) return;

    // Only send heartbeat in Room mode (live proximity)
    if (discoveryMode !== "room") return;

    if (!positionRef.current) {
      try {
        positionRef.current = await requestBrowserPosition();
        setLocationNotice(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : LOCATION_PERMISSION_MESSAGE;
        setLocationNotice(message);
        return;
      }
    }

    try {
      await sendHeartbeat(positionRef.current, currentUserId, currentCampusId, 100); // Room mode is always 100m
      sentInitialHeartbeat.current = true;
      // Always refresh nearby after heartbeat in Room mode to catch new users coming online
      void refreshNearby();
    } catch (err) {
      console.error("Heartbeat failed", err);
    }
  }, [authEvaluated, goLiveAllowed, currentUserId, currentCampusId, discoveryMode, refreshNearby]);

  // Trigger heartbeat on mount and interval
  useEffect(() => {
    void sendHeartbeatSafe();

    const schedule = () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      const visible = document.visibilityState === "visible";
      const interval = visible ? HEARTBEAT_VISIBLE_MS : HEARTBEAT_HIDDEN_MS;
      heartbeatTimer.current = setInterval(() => {
        void sendHeartbeatSafe();
      }, interval);
    };

    schedule();
    const vis = () => schedule();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, [sendHeartbeatSafe]);

  // Permanent Location Logic (Directory Mode - Campus and City)
  // NOTE: Location is OPTIONAL for directory modes. We only update if we already have a position.
  // We don't request location permission for campus/city mode, only for Room mode.
  const updatePermanentLocationSafe = useCallback(async () => {
    if (!authEvaluated || !goLiveAllowed || !currentUserId || !currentCampusId) return;

    // Only update permanent location in Directory Mode (Campus or City)
    if (discoveryMode === "room") return;

    // Only update if we already have a position (from a previous Room mode session)
    // Don't request location permission for directory modes
    if (!positionRef.current) {
      // No location available, but that's OK for campus/city mode
      return;
    }

    try {
      await updateProfileLocation(currentUserId, positionRef.current.coords.latitude, positionRef.current.coords.longitude);
      // Refresh nearby after updating location to get accurate distances
      void refreshNearby();
    } catch (err) {
      console.error("Failed to update permanent location", err);
    }
  }, [authEvaluated, goLiveAllowed, currentUserId, currentCampusId, discoveryMode, refreshNearby]);

  // Trigger permanent location update when switching to Directory Mode
  useEffect(() => {
    if (discoveryMode !== "room") {
      void updatePermanentLocationSafe();
    }
  }, [discoveryMode, updatePermanentLocationSafe]);

  const handleInvite = useCallback(
    async (targetUserId: string) => {
      if (!currentUserId || !currentCampusId) return;
      setInviteMessage(null);
      setInviteError(null);
      setInvitePendingId(targetUserId);
      try {
        const payload = { to_user_id: targetUserId, campus_id: currentCampusId } as const;
        const idemKey = await getOrCreateIdemKey("/invites/send", payload);
        const summary = await sendInvite(currentUserId, currentCampusId, targetUserId, { idemKey });
        if (summary.status === "accepted") {
          setInviteMessage("You're now friends!");
          setUsers((prev) => prev.map((u) => (u.user_id === targetUserId ? { ...u, is_friend: true } : u)));
          setFriendIds((prev) => new Set(prev).add(targetUserId));
          emitFriendshipFormed(targetUserId);
        } else {
          setInviteMessage("Invite sent.");
          setInvitedIds((prev) => new Set(prev).add(targetUserId));
        }
        emitInviteCountRefresh();
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : "Failed to send invite");
      } finally {
        setInvitePendingId(null);
      }
    },
    [currentCampusId, currentUserId],
  );

  const handleChat = useCallback(
    (targetUserId: string) => {
      router.push(`/chat/${targetUserId}`);
    },
    [router]
  );
  const handleModeSelect = (mode: DiscoveryMode) => {
    if (mode === "room") {
      if (userLevel < 4) {
        setInviteError("Social Level 4 required for Room Mode");
        setTimeout(() => setInviteError(null), 3000);
        return;
      }
      if (!authUser?.isUniversityVerified) {
        setInviteError("Elite Verification required for Room Mode");
        setTimeout(() => setInviteError(null), 3000);
        return;
      }
      // Room mode requires location permission
      setShowProximityPrompt(true);
    } else if (mode === "city") {
      setDiscoveryMode(mode);
    } else {
      setDiscoveryMode(mode);
    }
  };

  const confirmProximityMode = async () => {
    try {
      const pos = await requestBrowserPosition();
      positionRef.current = pos;
      setShowProximityPrompt(false);

      // Trigger immediate heartbeat with new location
      if (currentUserId && currentCampusId) {
        await sendHeartbeat(pos, currentUserId, currentCampusId, 100); // Room mode is always 100m
        sentInitialHeartbeat.current = true;
      }
      // Set mode AFTER heartbeat so the user is "live" before fetching nearby
      // The useEffect watching refreshNearby will automatically fetch with the new mode
      setDiscoveryMode("room");
    } catch (err) {
      const message = err instanceof Error ? err.message : LOCATION_PERMISSION_MESSAGE;
      setLocationNotice(message);
      setShowProximityPrompt(false);
    }
  };

  if (variant === "mini") return null;

  const isDirectoryMode = discoveryMode !== "room";

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50/50">
      {/* Header & Controls */}
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur-xl transition-all">
        <div className="mx-auto max-w-7xl space-y-4">
          {/* Top Row: Title & Status */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Discovery: Find Your Connections</h1>
              <p className="text-sm text-slate-500 mt-1">
                Explore students by proximity, campus, or city. {loading ? "Scanning..." : `${filteredUsers.length} student${filteredUsers.length === 1 ? '' : 's'} found matching your filters.`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset backdrop-blur-md",
                isDirectoryMode
                  ? "bg-slate-100 text-slate-700 ring-slate-200"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-200"
              )}>
                <span className={cn(
                  "relative flex h-2 w-2",
                  !isDirectoryMode && "animate-pulse"
                )}>
                  <span className={cn(
                    "absolute inline-flex h-full w-full rounded-full opacity-75",
                    isDirectoryMode ? "bg-slate-400" : "bg-emerald-500"
                  )} />
                  <span className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    isDirectoryMode ? "bg-slate-500" : "bg-emerald-500"
                  )} />
                </span>
                {isDirectoryMode ? "Directory Mode" : "Live Proximity"}
              </div>
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

            {/* Radius Control */}
            {/* Mode Selector */}
            <div className="relative flex-1 rounded-2xl bg-white p-2 sm:p-4 shadow-sm ring-1 ring-slate-100">
              {/* Informational Tooltips (Static for visuals as per request) */}


              <button
                type="button"
                onClick={() => setShowInfo(!showInfo)}
                className="absolute right-3 top-3 z-10 rounded-full p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                title="What do these modes mean?"
              >
                <Info size={14} />
              </button>

              {showInfo && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-12 top-0 z-50 w-72 rounded-xl bg-slate-900 p-5 text-xs leading-relaxed text-slate-300 shadow-xl ring-1 ring-white/10 animate-in fade-in zoom-in-95">
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-slate-900 ring-1 ring-white/10 border-l border-t border-white/10"></div>
                  <h4 className="font-bold text-white mb-3 text-sm">Discovery Modes</h4>
                  <ul className="space-y-3">
                    <li className="flex gap-2">
                      <div className="mt-0.5"><Home size={12} className="text-rose-400" /></div>
                      <div><strong className="text-white block">Room (Live)</strong>Find people within 100m. Best for gyms, libraries, or events.</div>
                    </li>
                    <li className="flex gap-2">
                      <div className="mt-0.5"><GraduationCap size={12} className="text-blue-400" /></div>
                      <div><strong className="text-white block">Campus</strong>Directory of students at your university.</div>
                    </li>
                    <li className="flex gap-2">
                      <div className="mt-0.5"><Building2 size={12} className="text-purple-400" /></div>
                      <div><strong className="text-white block">City</strong>Browse students from all universities in the area.</div>
                    </li>
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl">
                {DISCOVERY_MODES.map((modeOption) => {
                  const isSelected = discoveryMode === modeOption.mode;
                  const Icon = modeOption.mode === 'room' ? Home : modeOption.mode === 'campus' ? GraduationCap : Building2;
                  const isLocked = (modeOption.mode === 'room' && (userLevel < 4 || !authUser?.isUniversityVerified)) || (modeOption.mode === 'city' && userLevel < 1);

                  return (
                    <button
                      type="button"
                      key={modeOption.mode}
                      onClick={() => handleModeSelect(modeOption.mode)}
                      className={cn(
                        "relative flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg py-4 transition-all duration-200",
                        isSelected
                          ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-md shadow-blue-200"
                          : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700",
                        isLocked && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      <Icon size={24} className={cn(isSelected ? "text-white" : "text-rose-400 opacity-80")} />
                      <span className="text-xs font-semibold">{modeOption.label}</span>
                      {isLocked && (
                        <div className="absolute top-2 right-2 rounded-full bg-slate-100 p-1 text-slate-400">
                          <Lock size={10} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-1 flex-col gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 lg:flex-row lg:items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 lg:hidden">
                <Filter className="h-4 w-4 text-slate-500" />
                Filters
              </div>

              <div className="grid grid-cols-2 gap-3 lg:flex lg:w-full lg:items-center">
                {/* Major Filter */}
                <div className="relative col-span-2 lg:col-span-1 lg:flex-1">
                  <select
                    value={filterMajor}
                    onChange={(e) => setFilterMajor(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border-0 bg-white px-4 pr-8 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition focus:ring-2 focus:ring-rose-500"
                    aria-label="Filter by Major"
                  >
                    <option value="all">All Majors</option>
                    {uniqueMajors.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>

                {/* Year Filter */}
                <div className="relative lg:flex-1">
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border-0 bg-white px-4 pr-8 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition focus:ring-2 focus:ring-rose-500"
                    aria-label="Filter by Year"
                  >
                    <option value="all">All Years</option>
                    <option value="freshman">Freshman</option>
                    <option value="undergrad">Undergrad</option>
                    <option value="grad">Grad</option>
                    <option value="phd">PhD</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
        {/* Verification Banner */}
        {authEvaluated && authUser && (!authUser.isUniversityVerified || userLevel >= 4) && (
          <div className={cn(
            "mb-6 rounded-2xl p-4 ring-1",
            userLevel >= 4 && !authUser.isUniversityVerified ? "bg-amber-50 ring-amber-100" : "bg-indigo-50 ring-indigo-100"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "rounded-full p-2",
                userLevel >= 4 && !authUser.isUniversityVerified ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"
              )}>
                <BadgeCheck className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold">
                  {userLevel >= 4 ? "Unlock Room Mode: Elite Verification" : "Get Verified & Boost Your Profile"}
                </h3>
                <p className="mt-1 text-xs opacity-90">
                  {userLevel >= 4
                    ? "You've reached Level 4! To unlock 'Room Mode' and level up, verify your Student Email, Phone Number, and Identity. AI verification completes in minutes!"
                    : "Verify your university email to get a 5x discovery boost and a verification badge!"}
                </p>
                <button
                  onClick={() => router.push("/verify-university")}
                  className={cn(
                    "mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition",
                    userLevel >= 4 && !authUser.isUniversityVerified ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"
                  )}
                >
                  {userLevel >= 4 ? "Complete Elite Verification" : "Verify Now"}
                </button>
              </div>
            </div>
          </div>
        )}

        {locationNotice && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold">Location Access Needed</p>
              <p className="mt-1 text-amber-800">{locationNotice}</p>
              <button
                onClick={() => requestBrowserPosition()}
                className="mt-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200"
              >
                Enable Location
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">Unable to load discovery</p>
                <p className="mt-1 text-rose-700">{error}</p>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  void refreshNearby();
                }}
                className="shrink-0 rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-200 transition"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {loading && users.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-400">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-rose-100 opacity-75"></div>
              <div className="relative rounded-full bg-rose-50 p-4">
                <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
              </div>
            </div>
            <p className="text-sm font-medium">Scanning for students nearby...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <div className="mb-4 rounded-full bg-slate-100 p-6 ring-1 ring-slate-200">
              <Users className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No students found</h3>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              No new students to discover here. Try switching between Campus, City, or Room modes, or check your Friends tab!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredUsers.map((user) => (
              <ParallaxProfileCard
                key={user.user_id}
                user={user}
                isFriend={friendIds.has(user.user_id)}
                isInvited={invitedIds.has(user.user_id)}
                onInvite={() => handleInvite(user.user_id)}
                onChat={() => handleChat(user.user_id)}
                onProfileClick={() => setSelectedUser(user)}
                invitePending={invitePendingId === user.user_id}
                variant="preview"
                myCourses={myCourses}
              />
            ))}
          </div>
        )}
      </main>

      {/* Toast Messages */}
      {inviteMessage && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-xl animate-in fade-in slide-in-from-bottom-4">
          <div className="rounded-full bg-emerald-500 p-1">
            <Zap className="h-3 w-3 text-white" />
          </div>
          {inviteMessage}
        </div>
      )}
      {inviteError && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-sm font-medium text-white shadow-xl animate-in fade-in slide-in-from-bottom-4">
          {inviteError}
        </div>
      )}

      {/* Proximity Mode Prompt Modal */}
      {showProximityPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-rose-50 p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 ring-8 ring-rose-50">
                <MapPin className="h-8 w-8 text-rose-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Enter Proximity Mode?</h3>
              <p className="mt-2 text-sm text-slate-600">
                To see who is in this <strong>Room</strong>, we need to access your precise location.
              </p>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                  <div className="mt-0.5 rounded-full bg-emerald-100 p-1">
                    <Zap className="h-3 w-3 text-emerald-600" />
                  </div>
                  <div className="text-sm">
                    <p className="font-medium text-slate-900">Live Updates</p>
                    <p className="text-slate-500">See people moving in real-time.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                  <div className="mt-0.5 rounded-full bg-blue-100 p-1">
                    <Info className="h-3 w-3 text-blue-600" />
                  </div>
                  <div className="text-sm">
                    <p className="font-medium text-slate-900">Privacy First</p>
                    <p className="text-slate-500">Your location is only shared while you are active in this mode.</p>
                  </div>
                </div>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowProximityPrompt(false)}
                  className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmProximityMode}
                  className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700"
                >
                  Enable Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Detail Pop-up */}
      <ProfileDetailModal
        user={selectedUser}
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        isFriend={selectedUser ? friendIds.has(selectedUser.user_id) : false}
        isInvited={selectedUser ? invitedIds.has(selectedUser.user_id) : false}
        onInvite={() => selectedUser && handleInvite(selectedUser.user_id)}
        onChat={() => selectedUser && handleChat(selectedUser.user_id)}
        invitePending={selectedUser ? invitePendingId === selectedUser.user_id : false}
      />


    </div>
  );
}


