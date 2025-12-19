"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/http/client";
import { applyDiff } from "@/lib/diff";
import { formatDistance } from "@/lib/geo";
import { emitInviteCountRefresh } from "@/hooks/social/use-invite-count";
import {
  onAuthChange,
  readAuthSnapshot,
  readAuthUser,
  resolveAuthHeaders,
  type AuthUser,
} from "@/lib/auth-storage";
import { getBackendUrl } from "@/lib/env";
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
import { Loader2, MapPin, Zap, Filter, ChevronDown, Users, Info, X, LayoutGrid, Smartphone, ChevronLeft, ChevronRight, MessageCircle, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

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
const BACKEND_URL = getBackendUrl();
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



async function fetchNearby(userId: string, campusId: string, mode: DiscoveryMode) {
  // Build the URL safely
  const baseUrl = BACKEND_URL.replace(/\/$/, '');
  const params = new URLSearchParams({
    campus_id: campusId,
  });

  // Mode-based configuration
  if (mode === "room") {
    // Room mode: live proximity within 100m (uses Redis geosearch, all campuses)
    params.set("radius_m", "100");
    params.set("mode", "room");
  } else if (mode === "campus") {
    // Campus mode: directory of same campus users
    params.set("radius_m", "50000");
    params.set("mode", "campus");
  } else if (mode === "city") {
    // City mode: all users across all campuses
    params.set("radius_m", "50000");
    params.set("mode", "city");
  }

  const url = `${baseUrl}/proximity/nearby?${params.toString()}`;

  const snapshot = readAuthSnapshot();
  const headers: Record<string, string> = {
    ...resolveAuthHeaders(snapshot),
  };
  // Keep explicit fallbacks for dev/test flows where snapshot may be empty.
  headers["X-User-Id"] ||= userId;
  headers["X-Campus-Id"] ||= campusId;

  try {
    const body = await apiFetch<{ items?: NearbyUser[]; detail?: string }>(url, {
      cache: "no-store",
      cacheTtl: 0,
      skipDedup: true,
      headers,
    });
    return (body.items ?? []) as NearbyUser[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("presence not found")) {
      return [];
    }
    if (message.toLowerCase().includes("network")) {
      throw new Error("Unable to connect to server. Please check your connection.");
    }
    throw err;
  }
}

export default function DiscoveryFeed({ variant = "full" }: DiscoveryFeedProps) {
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>("campus"); // Default to campus
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'swipe'>('grid');
  const [swipeIndex, setSwipeIndex] = useState(0);
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

  // Filters
  const [filterMajor, setFilterMajor] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");

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
      if (filterMajor !== "all" && u.major !== filterMajor) return false;
      if (filterYear !== "all") {
        if (!u.graduation_year) return false;
        const label = getYearLabel(u.graduation_year);
        if (label !== filterYear) return false;
      }
      // "Active Today" is implicit for now as nearby returns recent users
      return true;
    });
  }, [users, filterMajor, filterYear]);

  useEffect(() => {
    setSwipeIndex(0);
  }, [filteredUsers]);

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
      const items = await fetchNearby(currentUserId, currentCampusId, discoveryMode);
      const patched = withFriendStatus(items);
      setUsers(patched);
      usersRef.current = patched;
      nearbyStateRef.current = applyNearbyEvent(initialiseNearbyAccumulator<NearbyUser>(), {
        items: patched,
      });
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load nearby classmates.";
      // If presence not found, it means we haven't sent a heartbeat yet. 
      // We'll ignore this error as the auto-heartbeat will fix it shortly.
      // In Directory Mode (campus/city), we don't expect presence errors anyway.
      if (!message.includes("presence not found")) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [authEvaluated, currentCampusId, currentUserId, discoveryMode, withFriendStatus]);

  // Initial nearby fetch
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
    [router],
  );

  const handleModeSelect = (mode: DiscoveryMode) => {
    if (mode === "room") {
      // Room mode requires location permission
      setShowProximityPrompt(true);
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
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Discovery</h1>
              <p className="text-sm font-medium text-slate-500">
                {loading ? "Scanning..." : `${filteredUsers.length} students found`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "rounded-md p-1.5 transition-all",
                    viewMode === 'grid' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                  title="Grid View"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('swipe')}
                  className={cn(
                    "rounded-md p-1.5 transition-all",
                    viewMode === 'swipe' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                  title="Swipe View"
                >
                  <Smartphone size={16} />
                </button>
              </div>

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
            <div className="relative flex-1 space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MapPin className="h-4 w-4 text-rose-500" />
                    Search Radius
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowInfo(!showInfo)}
                    className="rounded-full text-slate-400 transition hover:bg-rose-100 hover:text-rose-600"
                    aria-label="More info"
                  >
                    <Info size={16} />
                  </button>
                </div>
              </div>

              {showInfo && (
                <div className="absolute left-4 top-12 z-50 w-64 rounded-xl bg-slate-800 p-4 text-xs leading-relaxed text-white shadow-xl ring-1 ring-white/10 animate-in fade-in zoom-in-95">
                  <div className="absolute -top-1.5 left-24 h-3 w-3 rotate-45 bg-slate-800"></div>
                  <p className="mb-3">
                    Use <span className="font-bold text-white">Room</span> mode to see people within 100m of you. Perfect for spotting your gym crush or classmates! 👀
                  </p>
                  <div className="border-t border-white/10 pt-2">
                    <p className="mb-1"><span className="font-bold text-white">Campus:</span> See students from your university.</p>
                    <p><span className="font-bold text-white">City:</span> Discover students from all universities nearby.</p>
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-2">
                {DISCOVERY_MODES.map((modeOption) => (
                  <button
                    type="button"
                    key={modeOption.mode}
                    onClick={() => handleModeSelect(modeOption.mode)}
                    className={cn(
                      "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-3 text-xs font-medium transition-all",
                      discoveryMode === modeOption.mode
                        ? "bg-white text-rose-600 shadow-sm ring-1 ring-rose-200"
                        : "text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm"
                    )}
                  >
                    <span className="text-xl mb-1">{modeOption.emoji}</span>
                    {modeOption.label}
                  </button>
                ))}
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
              Try clearing your filters or check back later.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredUsers.map((user) => (
              <UserCard
                key={user.user_id}
                user={user}
                isFriend={friendIds.has(user.user_id)}
                isInvited={invitedIds.has(user.user_id)}
                onInvite={() => handleInvite(user.user_id)}
                onChat={() => handleChat(user.user_id)}
                invitePending={invitePendingId === user.user_id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            {swipeIndex < filteredUsers.length ? (
              <div className="flex w-full max-w-lg items-center justify-center gap-6">
                {/* Left Arrow (Previous) */}
                <button
                  onClick={() => setSwipeIndex((prev) => Math.max(0, prev - 1))}
                  disabled={swipeIndex === 0}
                  className="hidden rounded-full bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:shadow-md disabled:opacity-50 sm:block"
                  aria-label="Previous Profile"
                >
                  <ChevronLeft size={24} className="text-slate-600" />
                </button>

                <div className="w-full max-w-sm">
                  <UserCard
                    key={filteredUsers[swipeIndex].user_id}
                    user={filteredUsers[swipeIndex]}
                    isFriend={friendIds.has(filteredUsers[swipeIndex].user_id)}
                    isInvited={invitedIds.has(filteredUsers[swipeIndex].user_id)}
                    onInvite={async () => {
                      await handleInvite(filteredUsers[swipeIndex].user_id);
                      setSwipeIndex((prev) => prev + 1);
                    }}
                    onChat={() => handleChat(filteredUsers[swipeIndex].user_id)}
                    invitePending={invitePendingId === filteredUsers[swipeIndex].user_id}
                  />

                  {/* Mobile Navigation Controls (Below Card) */}
                  <div className="mt-6 flex items-center justify-center gap-4 sm:hidden">
                    <button
                      onClick={() => setSwipeIndex((prev) => Math.max(0, prev - 1))}
                      disabled={swipeIndex === 0}
                      className="rounded-full bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Previous Profile"
                    >
                      <ChevronLeft size={24} className="text-slate-600" />
                    </button>
                    <button
                      onClick={() => setSwipeIndex((prev) => prev + 1)}
                      className="rounded-full bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                      aria-label="Next Profile"
                    >
                      <ChevronRight size={24} className="text-slate-600" />
                    </button>
                  </div>
                </div>

                {/* Right Arrow (Next) */}
                <button
                  onClick={() => setSwipeIndex((prev) => prev + 1)}
                  className="hidden rounded-full bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:shadow-md sm:block"
                  aria-label="Next Profile"
                >
                  <ChevronRight size={24} className="text-slate-600" />
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-4 inline-flex rounded-full bg-slate-100 p-6">
                  <Users className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">That&apos;s everyone!</h3>
                <p className="text-slate-500">You&apos;ve seen all profiles in this area.</p>
                <button
                  onClick={() => setSwipeIndex(0)}
                  className="mt-4 font-medium text-rose-600 hover:underline"
                >
                  Start Over
                </button>
              </div>
            )}
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
    </div>
  );
}

function UserCard({
  user,
  isFriend,
  isInvited,
  onInvite,
  onChat,
  invitePending
}: {
  user: NearbyUser;
  isFriend: boolean;
  isInvited: boolean;
  onInvite: () => void;
  onChat: () => void;
  invitePending: boolean;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [imageError, setImageError] = useState(false);

  const images = useMemo(() => {
    if (user.gallery && user.gallery.length > 0) {
      return user.gallery.map((g) => g.url).filter(Boolean) as string[];
    }
    if (user.avatar_url) {
      return [user.avatar_url];
    }
    return [];
  }, [user]);

  // Reset image error state when images change
  useEffect(() => {
    setImageError(false);
  }, [images]);

  const currentImage = !imageError && images.length > 0 ? images[imageIndex % images.length] : null;
  const hasMultipleImages = images.length > 1;

  const handleImageClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasMultipleImages) {
      setImageIndex((prev) => (prev + 1) % images.length);
    }
  };

  const distance = formatDistance(user.distance_m ?? null);
  const initial = (user.display_name || user.handle || "?")[0].toUpperCase();

  return (
    <div className="group relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-slate-900 shadow-md transition-all hover:shadow-xl">
      {/* Image / Avatar Area */}
      <div
        className={cn(
          "relative h-full w-full",
          hasMultipleImages && "cursor-pointer"
        )}
        onClick={handleImageClick}
      >
        {currentImage ? (
          <Image
            key={currentImage}
            src={currentImage}
            alt={user.display_name}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-50 to-slate-100 text-6xl font-bold text-rose-200">
            {initial}
          </div>
        )}

        {/* Image Indicators */}
        {hasMultipleImages && !showDetails && (
          <div className="absolute left-0 right-0 top-3 z-10 flex justify-center gap-1.5 px-4">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "h-1 flex-1 rounded-full shadow-sm backdrop-blur-md transition-all",
                  idx === (imageIndex % images.length)
                    ? "bg-white"
                    : "bg-white/40"
                )}
              />
            ))}
          </div>
        )}

        {/* Info Toggle Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
          className="absolute right-4 top-4 z-20 rounded-full bg-black/20 p-2.5 text-white backdrop-blur-md transition hover:bg-black/40 hover:scale-105 active:scale-95"
        >
          {showDetails ? <X size={18} /> : <Info size={18} />}
        </button>

        {/* Details Overlay */}
        {showDetails && (
          <div
            className="absolute inset-0 z-10 flex flex-col bg-slate-900/95 p-6 text-white animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-8 flex-1 overflow-y-auto scrollbar-hide">
              <div className="mb-6">
                <h4 className="text-2xl font-bold">{user.display_name}</h4>
              </div>

              {user.bio && user.bio.trim().length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">About</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">
                    {user.bio}
                  </p>
                </div>
              )}

              {user.passions && user.passions.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Passions</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {user.passions.map((p) => (
                      <span key={p} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {user.courses && user.courses.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Courses</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {user.courses.map((c) => (
                      <span key={c} className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/40">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {((user.major && user.major.toLowerCase() !== "none") || user.graduation_year) && (
                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Details</p>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    {user.major && user.major.toLowerCase() !== "none" && (
                      <div>
                        <span className="block text-slate-500">Major</span>
                        <span className="text-slate-200">{user.major}</span>
                      </div>
                    )}
                    {user.graduation_year && (
                      <div>
                        <span className="block text-slate-500">Year</span>
                        <span className="text-slate-200">{user.graduation_year}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {user.ten_year_vision && user.ten_year_vision.trim().length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">10-Year Vision</p>
                  <p className="mt-2 text-sm italic leading-relaxed text-emerald-200">
                    &ldquo;{user.ten_year_vision}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Overlay (Hidden when details shown) */}
        {!showDetails && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-xl font-bold leading-tight drop-shadow-sm">{user.display_name || user.handle}</h3>
                {isFriend && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-sm ring-1 ring-emerald-500/40">
                    Friend
                  </span>
                )}
              </div>

              {user.campus_name && (
                <p className="text-sm font-medium text-slate-200 drop-shadow-sm">{user.campus_name}</p>
              )}
              <p className="text-sm font-medium text-slate-300 drop-shadow-sm">
                {[
                  user.major && user.major.toLowerCase() !== "none" ? user.major : null,
                  user.graduation_year ? `'${String(user.graduation_year).slice(-2)}` : null
                ].filter(Boolean).join(" • ")}
              </p>

              <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                {distance && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-rose-400" />
                    {distance} away
                  </span>
                )}
              </div>

              {/* Courses Preview */}
              {user.courses && user.courses.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {user.courses.slice(0, 2).map((c) => (
                    <span key={c} className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-500/30 backdrop-blur-sm">
                      {c}
                    </span>
                  ))}
                  {user.courses.length > 2 && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-medium text-white/60 backdrop-blur-sm">
                      +{user.courses.length - 2} more
                    </span>
                  )}
                </div>
              )}

              {/* Action Button */}
              <div className="mt-4">
                {isFriend ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChat();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
                  >
                    <MessageCircle size={16} />
                    Message
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isInvited) onInvite();
                    }}
                    disabled={invitePending || isInvited}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-100 disabled:cursor-not-allowed",
                      isInvited
                        ? "bg-slate-100 text-slate-500 cursor-default"
                        : "bg-rose-600 text-white shadow-lg shadow-rose-900/20 hover:bg-rose-500"
                    )}
                  >
                    {invitePending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : isInvited ? (
                      <>
                        <span className="text-slate-500">Pending</span>
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} />
                        Connect
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div >
  );
}
