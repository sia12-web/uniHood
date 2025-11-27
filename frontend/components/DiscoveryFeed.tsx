"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { applyDiff } from "@/lib/diff";
import { formatDistance } from "@/lib/geo";
import { emitInviteCountRefresh } from "@/hooks/social/use-invite-count";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { getBackendUrl } from "@/lib/env";
import {
  disconnectPresenceSocket,
  getPresenceSocket,
  initialiseNearbyAccumulator,
  applyNearbyEvent,
  nearbyAccumulatorToArray,
} from "@/lib/socket";
import { getOrCreateIdemKey } from "@/app/api/idempotency";
import { fetchFriends, sendInvite } from "@/lib/social";
import { emitFriendshipFormed } from "@/lib/friends-events";
import { updateProfileLocation } from "@/lib/profiles";
import {
  LOCATION_PERMISSION_MESSAGE,
  requestBrowserPosition,
  sendHeartbeat,
} from "@/lib/presence/api";
import type { NearbyDiff, NearbyUser } from "@/lib/types";
import { Loader2, MapPin, Zap, Filter, ChevronDown, Users, Info, X, LayoutGrid, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

type DiscoveryFeedProps = {
  variant?: "full" | "mini";
};

const RADIUS_PRESETS = [
  { label: "Room", value: 10, emoji: "🏠" },
  { label: "Building", value: 50, emoji: "🏢" },
  { label: "Campus", value: 500, emoji: "🎓" },
  { label: "City", value: 2000, emoji: "🏙️" },
];

type NearbyAccumulator<T> = {
  cursor: string | null;
  order: string[];
  entries: Map<string, T>;
};

// Config parallels /proximity page
const BACKEND_URL = getBackendUrl();
const HEARTBEAT_VISIBLE_MS = 2000;
const HEARTBEAT_HIDDEN_MS = 6000;
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
  if (diff === 3) return "sophomore";
  if (diff === 2) return "junior";
  if (diff === 1) return "senior";
  return "grad";
}

async function fetchNearby(userId: string, campusId: string, radius: number) {
  const url = new URL("/proximity/nearby", BACKEND_URL);
  url.searchParams.set("campus_id", campusId);
  url.searchParams.set("radius_m", String(radius));
  const response = await fetch(url.toString(), {
    headers: {
      "X-User-Id": userId,
      "X-Campus-Id": campusId,
    },
  });
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = await response.json();
      detail = typeof body?.detail === "string" ? body.detail : null;
    } catch {}
    if (response.status === 400 && detail === "presence not found") {
      return [];
    }
    throw new Error(`Nearby request failed (${response.status})${detail ? ` - ${detail}` : ""}`);
  }
  const body = await response.json();
  return body.items as NearbyUser[];
}

export default function DiscoveryFeed({ variant = "full" }: DiscoveryFeedProps) {
  const [radius, setRadius] = useState<number>(2000); // Default to wider range
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
  
  // Filters
  const [filterMajor, setFilterMajor] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
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
    const majors = new Set(users.map((u) => u.major).filter(Boolean) as string[]);
    return Array.from(majors);
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

  useEffect(() => {
    nearbyStateRef.current = initialiseNearbyAccumulator<NearbyUser>();
    usersRef.current = [];
  }, [radius, currentCampusId]);

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
    
    nearbyStateRef.current = applyNearbyEvent(initialiseNearbyAccumulator<NearbyUser>(), {
      items: usersRef.current,
    });
    const handleUpdate = (payload: NearbyDiff) => {
      setUsers((prev) => {
        const next = applyDiff(prev, payload, radius);
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
    socket.emit("nearby:subscribe", { campus_id: currentCampusId, radius_m: radius });
    return () => {
      socket.off("nearby:update", handleUpdate);
      socket.off("presence:nearby", handleNearby);
      socket.emit("nearby:unsubscribe", { campus_id: currentCampusId, radius_m: radius });
    };
  }, [socket, radius, currentCampusId, withFriendStatus]);

  useEffect(() => () => disconnectPresenceSocket(), []);

  const refreshNearby = useCallback(async () => {
    if (!authEvaluated || !currentUserId || !currentCampusId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await fetchNearby(currentUserId, currentCampusId, radius);
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
      // In Directory Mode (>50m), we don't expect presence errors anyway.
      if (!message.includes("presence not found")) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [authEvaluated, currentCampusId, currentUserId, radius, withFriendStatus]);

  // Initial nearby fetch
  useEffect(() => {
    if (authEvaluated) {
      void refreshNearby();
    }
  }, [authEvaluated, refreshNearby]);

  // Auto-Heartbeat Logic
  const sendHeartbeatSafe = useCallback(async () => {
    if (!authEvaluated || !goLiveAllowed || !currentUserId || !currentCampusId) return;
    
    // Only send heartbeat if radius is small (Proximity Mode)
    if (radius > 50) return;

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
      await sendHeartbeat(positionRef.current, currentUserId, currentCampusId, radius);
      sentInitialHeartbeat.current = true;
      // If this was the first heartbeat, refresh nearby to get results
      if (users.length === 0) {
        void refreshNearby();
      }
    } catch (err) {
      console.error("Heartbeat failed", err);
    }
  }, [authEvaluated, goLiveAllowed, currentUserId, currentCampusId, radius, users.length, refreshNearby]);

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

  // Permanent Location Logic (Directory Mode)
  const updatePermanentLocationSafe = useCallback(async () => {
    if (!authEvaluated || !goLiveAllowed || !currentUserId || !currentCampusId) return;
    
    // Only update permanent location if radius > 50 (Directory Mode)
    if (radius <= 50) return;

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
      await updateProfileLocation(currentUserId, positionRef.current.coords.latitude, positionRef.current.coords.longitude);
      // Refresh nearby after updating location to get accurate distances
      void refreshNearby();
    } catch (err) {
      console.error("Failed to update permanent location", err);
    }
  }, [authEvaluated, goLiveAllowed, currentUserId, currentCampusId, radius, refreshNearby]);

  // Trigger permanent location update when switching to Directory Mode
  useEffect(() => {
      if (radius > 50) {
          void updatePermanentLocationSafe();
      }
  }, [radius, updatePermanentLocationSafe]);

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

  if (variant === "mini") return null;

  const isDirectoryMode = radius > 50;

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50/50">
      {/* Header & Controls */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur-xl transition-all">
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
            <div className="flex-1 space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MapPin className="h-4 w-4 text-rose-500" />
                  Search Radius
                </label>
                <span className="font-mono text-sm font-bold text-rose-600">{radius}m</span>
              </div>
              
              <input
                type="range"
                min="10"
                max="2000"
                step="10"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-rose-600 transition-all hover:bg-slate-300"
                aria-label="Search Radius"
              />

              <div className="flex justify-between gap-2">
                {RADIUS_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setRadius(preset.value)}
                    className={cn(
                      "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium transition-all",
                      radius === preset.value
                        ? "bg-white text-rose-600 shadow-sm ring-1 ring-rose-200"
                        : "text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm"
                    )}
                  >
                    <span className="text-base">{preset.emoji}</span>
                    {preset.label}
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
                <div className="relative lg:flex-1">
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
                    <option value="sophomore">Sophomore</option>
                    <option value="junior">Junior</option>
                    <option value="senior">Senior</option>
                    <option value="grad">Grad</option>
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
            <p className="font-bold">Error</p>
            {error}
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
              Try increasing your search radius to <button onClick={() => setRadius(2000)} className="font-medium text-rose-600 hover:underline">2km</button> or clearing your filters.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredUsers.map((user) => (
              <UserCard
                key={user.user_id}
                user={user}
                isFriend={friendIds.has(user.user_id)}
                onInvite={() => handleInvite(user.user_id)}
                onChat={() => handleChat(user.user_id)}
                invitePending={invitePendingId === user.user_id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            {swipeIndex < filteredUsers.length ? (
              <div className="w-full max-w-sm">
                <UserCard
                  key={filteredUsers[swipeIndex].user_id}
                  user={filteredUsers[swipeIndex]}
                  isFriend={friendIds.has(filteredUsers[swipeIndex].user_id)}
                  onInvite={async () => {
                    await handleInvite(filteredUsers[swipeIndex].user_id);
                    setSwipeIndex(prev => prev + 1);
                  }}
                  onChat={() => handleChat(filteredUsers[swipeIndex].user_id)}
                  invitePending={invitePendingId === filteredUsers[swipeIndex].user_id}
                />
                <div className="mt-6 flex gap-4">
                   <button 
                     onClick={() => setSwipeIndex(prev => prev + 1)}
                     className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-600 transition hover:bg-slate-200"
                   >
                     Pass
                   </button>
                </div>
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
    </div>
  );
}

function UserCard({ 
  user, 
  isFriend, 
  onInvite, 
  onChat, 
  invitePending 
}: { 
  user: NearbyUser; 
  isFriend: boolean; 
  onInvite: () => void; 
  onChat: () => void;
  invitePending: boolean;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  
  const images = useMemo(() => {
    if (user.gallery && user.gallery.length > 0) {
      return user.gallery.map((g) => g.url).filter(Boolean) as string[];
    }
    if (user.avatar_url) {
      return [user.avatar_url];
    }
    return [];
  }, [user]);

  const currentImage = images.length > 0 ? images[imageIndex % images.length] : null;
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
    <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
      {/* Image / Avatar Area */}
      <div 
        className={cn(
          "relative aspect-[4/5] w-full bg-slate-100",
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
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-50 to-slate-100 text-6xl font-bold text-rose-200">
            {initial}
          </div>
        )}
        
        {/* Image Indicators */}
        {hasMultipleImages && !showDetails && (
          <div className="absolute left-0 right-0 top-2 flex justify-center gap-1 px-2 z-10">
            {images.map((_, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "h-1 flex-1 rounded-full backdrop-blur-md transition-all",
                  idx === (imageIndex % images.length)
                    ? "bg-white" 
                    : "bg-white/30"
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
          className="absolute right-3 top-3 z-20 rounded-full bg-black/20 p-2 text-white backdrop-blur-md transition hover:bg-black/40"
        >
          {showDetails ? <X size={16} /> : <Info size={16} />}
        </button>

        {/* Details Overlay */}
        {showDetails && (
          <div 
            className="absolute inset-0 z-10 flex flex-col bg-slate-900/95 p-6 text-white animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
             <div className="mt-8 flex-1 overflow-y-auto scrollbar-hide">
               <div className="mb-6">
                 <h4 className="text-xl font-bold">{user.display_name}</h4>
                 <p className="text-sm text-slate-400">@{user.handle}</p>
               </div>
               
               <div className="mb-6">
                 <p className="text-xs font-bold uppercase tracking-wider text-slate-500">About</p>
                 <p className="mt-2 text-sm leading-relaxed text-slate-200">
                   {user.bio || "No bio available."}
                 </p>
               </div>

               <div className="mb-6">
                 <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Passions</p>
                 <div className="mt-2 flex flex-wrap gap-2">
                   {user.passions && user.passions.length > 0 ? (
                     user.passions.map((p) => (
                       <span key={p} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/20">
                         {p}
                       </span>
                     ))
                   ) : (
                     <span className="text-sm text-slate-500 italic">No passions listed</span>
                   )}
                 </div>
               </div>

               <div className="mb-6">
                 <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Courses</p>
                 <div className="mt-2 flex flex-wrap gap-2">
                   {user.courses && user.courses.length > 0 ? (
                     user.courses.map((c) => (
                       <span key={c} className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/40">
                         {c}
                       </span>
                     ))
                   ) : (
                     <span className="text-sm text-slate-500 italic">No courses listed</span>
                   )}
                 </div>
               </div>

               <div>
                 <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Details</p>
                 <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="block text-slate-500">Major</span>
                        <span className="text-slate-200">{user.major || "Undeclared"}</span>
                    </div>
                    <div>
                        <span className="block text-slate-500">Year</span>
                        <span className="text-slate-200">{user.graduation_year || "Unknown"}</span>
                    </div>
                 </div>
               </div>
             </div>
          </div>
        )}
        
        {/* Content Overlay (Hidden when details shown) */}
        {!showDetails && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 text-white">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-lg font-bold leading-tight">{user.display_name || user.handle}</h3>
                {isFriend && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-sm">
                    Friend
                  </span>
                )}
              </div>
              
              <p className="text-sm font-medium text-slate-200">
                {user.major || "Student"} {user.graduation_year ? `'${String(user.graduation_year).slice(-2)}` : ""}
              </p>
              
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur-md">
                  <MapPin className="h-3 w-3" />
                  {distance} away
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action Area */}
      <div className="border-t border-slate-100 p-3">
        {isFriend ? (
          <button
            onClick={onChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
          >
            Message
          </button>
        ) : (
          <button
            onClick={onInvite}
            disabled={invitePending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-70"
          >
            {invitePending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Invite"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
