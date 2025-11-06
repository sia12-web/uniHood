"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MiniMap } from "@/app/proximity/components/MiniMap";
import { NearbyList } from "@/app/proximity/components/NearbyList";
import { getBackendUrl, getDemoCampusId, getDemoLatitude, getDemoLongitude, getDemoUserId } from "@/lib/env";
import { clampHeartbeatAccuracy, formatDistance } from "@/lib/geo";
import { fetchFriends, sendInvite } from "@/lib/social";
import type { InviteSummary, NearbyUser } from "@/lib/types";
import type { AuthUser } from "@/lib/auth-storage";

import {
  LOCATION_PERMISSION_MESSAGE,
  createFallbackPosition,
  requestBrowserPosition,
  sendHeartbeat,
  sendOffline,
} from "@/lib/presence/api";

const BACKEND_URL = getBackendUrl();

const DEMO_CAMPUS_ID = getDemoCampusId();
const DEMO_USER_ID = getDemoUserId();
const DEMO_LAT = getDemoLatitude();
const DEMO_LON = getDemoLongitude();
const RADIUS_OPTIONS = [20, 50, 200];
const MIN_REFRESH_INTERVAL_MS = 2500;
const HEARTBEAT_INTERVAL_MS = 15000;
const INVITE_SUCCESS_TIMEOUT_MS = 3200;

const PASSION_POOL = [
  "Sunset hikes",
  "Museum wandering",
  "Open-mic nights",
  "Studio jam sessions",
  "Coffee tastings",
  "Thrift treasure hunts",
  "Late-night coding sprints",
  "Campus photography walks",
  "Weekend road trips",
  "Farmer's market runs",
  "Board game showdowns",
  "Cinematic marathons",
];

const FALLBACK_GALLERY_BACKDROPS = [
  "from-amber-200 via-amber-100 to-white",
  "from-rose-200 via-rose-100 to-white",
  "from-blue-200 via-sky-100 to-white",
  "from-emerald-200 via-emerald-100 to-white",
  "from-purple-200 via-fuchsia-100 to-white",
];

// Demo showcase content removed in production

function fallbackPassions(seed: string, count = 3): string[] {
  const sanitized = seed || "divan";
  let hash = 0;
  for (let index = 0; index < sanitized.length; index += 1) {
    hash = (hash << 5) - hash + sanitized.charCodeAt(index);
    hash |= 0;
  }

  const selections: string[] = [];
  const used = new Set<number>();
  const max = Math.min(count, PASSION_POOL.length);

  for (let step = 0; selections.length < max && step < PASSION_POOL.length * 2; step += 1) {
    const candidate = Math.abs((hash + step * 7) % PASSION_POOL.length);
    if (!used.has(candidate)) {
      used.add(candidate);
      selections.push(PASSION_POOL[candidate]);
    }
  }

  return selections;
}

type RadiusMeta = {
  count: number | null;
  loading: boolean;
  lastUpdated?: number;
};

// Note: demo-only helpers removed to avoid unused vars during production builds

function createDefaultRadiusMeta(activeRadius: number = RADIUS_OPTIONS[1]): Record<number, RadiusMeta> {
  const next: Record<number, RadiusMeta> = {};
  RADIUS_OPTIONS.forEach((option) => {
    next[option] = {
      count: null,
      loading: option === activeRadius,
    };
  });
  return next;
}

type HomeProximityPreviewProps = {
  authUser: AuthUser | null;
  className?: string;
};

function toNearbyInviteStatus(status: InviteSummary["status"]): "pending" | "incoming" | "none" {
  return status === "sent" ? "pending" : "none";
}

function parseInviteErrorDetail(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) {
    return null;
  }
  try {
    const parsed = JSON.parse(message);
    if (typeof parsed === "object" && parsed && typeof (parsed as { detail?: unknown }).detail === "string") {
      return (parsed as { detail: string }).detail;
    }
  } catch {
    // ignore JSON parse failures
  }
  // Removed local createFallbackPosition implementation to rely on the shared helper

  if (message.includes("already_friends")) {
    return "already_friends";
  }
  return null;
}

async function fetchNearby(
  userId: string,
  campusId: string,
  radius: number,
  signal: AbortSignal,
): Promise<NearbyUser[]> {
  const url = new URL("/proximity/nearby", BACKEND_URL);
  url.searchParams.set("campus_id", campusId);
  url.searchParams.set("radius_m", String(radius));

  const response = await fetch(url.toString(), {
    headers: {
      "X-User-Id": userId,
      "X-Campus-Id": campusId,
    },
    signal,
  });

  if (!response.ok) {
    if (response.status === 400) {
      try {
        const body = await response.json();
        if (body?.detail === "presence not found") {
          return [];
        }
      } catch {
        // ignore parse failure and fall through to error below
      }
    }

    if (response.status === 429) {
      throw new Error("Refreshing too quickly — give the radar a second.");
    }

    throw new Error(`Unable to load nearby pulses (${response.status})`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.items) ? (payload.items as NearbyUser[]) : [];
}

type RadiusDialProps = {
  options: number[];
  activeRadius: number;
  onRadiusChange: (radius: number) => void;
  meta: Record<number, RadiusMeta>;
  loading: boolean;
};

function RadiusDial({ options, activeRadius, onRadiusChange, meta, loading }: RadiusDialProps) {
  const sliderIndex = useMemo(() => {
    const index = options.indexOf(activeRadius);
    return index === -1 ? 0 : index;
  }, [activeRadius, options]);

  const activeCount = meta[activeRadius]?.count;

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">Discovery radius</span>
        <span className="text-sm font-semibold text-slate-900">{activeRadius}m</span>
      </div>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={sliderIndex}
        onChange={(event) => {
          const index = Number(event.target.value) || 0;
          const nextRadius = options[index];
          if (typeof nextRadius === "number") {
            onRadiusChange(nextRadius);
          }
        }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
        aria-label="Discovery radius"
      />
      <div className="flex items-center justify-between text-[0.55rem] uppercase tracking-wide text-slate-400">
        <span>Closer</span>
        <span>Wider</span>
      </div>
      <div className="text-[0.6rem] font-medium text-slate-500">
        {loading
          ? "Refreshing nearby pulses…"
          : activeCount != null
            ? `${activeCount} nearby pulse${activeCount === 1 ? "" : "s"}`
            : "Scanning area…"}
      </div>
    </div>
  );
}

export function HomeProximityPreview({ authUser, className }: HomeProximityPreviewProps) {
  // Disable demo mode to avoid showing hardcoded sample user (Lily) on first paint
  const isDemoMode = false;
  const [activeRadius, setActiveRadius] = useState<number>(RADIUS_OPTIONS[1]);
  const [meta, setMeta] = useState<Record<number, RadiusMeta>>(() => createDefaultRadiusMeta(RADIUS_OPTIONS[1]));
  const [users, setUsers] = useState<NearbyUser[]>(() => []);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [galleryPreviewImage, setGalleryPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isLiveProcessing, setIsLiveProcessing] = useState(false);
  const [presenceMessage, setPresenceMessage] = useState<string | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [invitePendingId, setInvitePendingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [friendsReady, setFriendsReady] = useState<boolean>(false);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const galleryCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFetchRef = useRef<Record<string, number>>({});
  const positionRef = useRef<GeolocationPosition | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const inviteMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendIdsRef = useRef<Record<string, true>>({});
  const friendMapReadyRef = useRef<boolean>(false);

  const withFriendFlags = useCallback(
    (list: NearbyUser[]) =>
      list.map((user) => {
        const shouldBeFriend = Boolean(friendIdsRef.current[user.user_id]);
        if (shouldBeFriend) {
          const inviteStatus: NearbyUser["invite_status"] = user.invite_status === "pending" ? "pending" : "none";
          if (user.is_friend === true && user.invite_status === inviteStatus) {
            return user;
          }
          return {
            ...user,
            is_friend: true,
            invite_status: inviteStatus,
          };
        }

        if (friendMapReadyRef.current && user.is_friend) {

  const selectedUserBio = useMemo(() => {
    if (!selectedUser) {
      return null;
    }
    if (selectedUser.bio && selectedUser.bio.trim().length > 0) {
      return selectedUser.bio.trim();
    }
    const firstPassion = selectedUserPassions[0];
    return firstPassion
      ? `Always game for ${firstPassion.toLowerCase()} and unplanned campus adventures.`
      : "Always down for spontaneous meetups around campus.";
  }, [selectedUser, selectedUserPassions]);

  const selectedUserDistanceText = useMemo(() => {
    if (!selectedUser) {
      return null;
    }
    return formatDistance(selectedUser.distance_m ?? null);
  }, [selectedUser]);

  const userId = authUser?.userId ?? DEMO_USER_ID;
  const campusId = authUser?.campusId ?? DEMO_CAMPUS_ID;

  useEffect(() => {
    // Always start in non-demo mode; reset to clean state
    friendIdsRef.current = {};
    friendMapReadyRef.current = false;
    setFriendsReady(false);
    setUsers([]);
    setSelectedUserId(null);
    setActiveRadius(RADIUS_OPTIONS[1]);
    setMeta(createDefaultRadiusMeta(RADIUS_OPTIONS[1]));
  }, []);

  // Demo mode disabled; no-op on activeRadius change

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const stopWatchingPosition = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return;
    }
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatchPosition = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return;
    }
    stopWatchingPosition();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        positionRef.current = position;
        setAccuracyM(position.coords.accuracy ?? null);
      },
      (err) => {
        setPresenceError(err.message || "Unable to refresh location");
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      },
    );
  }, [stopWatchingPosition]);

  const cleanupLiveMode = useCallback(() => {
    clearHeartbeatTimer();
    stopWatchingPosition();
    positionRef.current = null;
    setAccuracyM(null);
  }, [clearHeartbeatTimer, stopWatchingPosition]);

  const startHeartbeatLoop = useCallback(() => {
    clearHeartbeatTimer();
    heartbeatTimerRef.current = setInterval(() => {
      if (!positionRef.current) {
        return;
      }
      void sendHeartbeat(positionRef.current, userId, campusId, activeRadius)
        .then(() => {
          setPresenceError(null);
        })
        .catch((err) => {
          setPresenceError(err instanceof Error ? err.message : "Unable to refresh location");
        });
    }, HEARTBEAT_INTERVAL_MS);
  }, [activeRadius, campusId, clearHeartbeatTimer, userId]);

  useEffect(() => {
    if (!userId || !campusId) {
      friendIdsRef.current = {};
      friendMapReadyRef.current = true;
      setFriendsReady(true);
      setUsers((previous) => withFriendFlags(previous));
      return;
    }

    if (isDemoMode) {
      friendIdsRef.current = {};
      friendMapReadyRef.current = true;
      setFriendsReady(true);
      setUsers((previous) => withFriendFlags(previous));
      return;
    }

    let cancelled = false;
    setFriendsReady(false);
    friendMapReadyRef.current = false;

    const loadFriends = async () => {
      try {
        const rows = await fetchFriends(userId, campusId, "accepted");
        if (cancelled) {
          return;
        }
        const map: Record<string, true> = {};
        for (const row of rows) {
          const peerId = row.friend_id === userId ? row.user_id : row.friend_id;
          if (peerId && peerId !== userId) {
            map[peerId] = true;
          }
        }
        friendIdsRef.current = map;
      } catch {
        if (cancelled) {
          return;
        }
        friendIdsRef.current = {};
      } finally {
        if (cancelled) {
          return;
        }
        friendMapReadyRef.current = true;
        setFriendsReady(true);
        setUsers((previous) => withFriendFlags(previous));
      }
    };

    void loadFriends();

    return () => {
      cancelled = true;
    };
  }, [campusId, isDemoMode, userId, withFriendFlags]);

  useEffect(() => {
    if (!userId || !campusId) {
      return undefined;
    }

    if (isDemoMode) {
      return undefined;
    }

    if (!isLiveMode) {
      setUsers([]);
      setMeta((previous) => ({
        ...previous,
        [activeRadius]: {
          ...previous[activeRadius],
          count: previous[activeRadius]?.count ?? null,
          loading: false,
        },
      }));
      return undefined;
    }

    const controller = new AbortController();
    const fetchKey = `${userId}:${campusId}:${activeRadius}`;
    const lastFetch = lastFetchRef.current[fetchKey];
    const now = Date.now();
    if (lastFetch && now - lastFetch < MIN_REFRESH_INTERVAL_MS && !controller.signal.aborted) {
      return () => {
        controller.abort();
      };
    }
    lastFetchRef.current[fetchKey] = now;

    let cancelled = false;

    setLoading(true);
    setError(null);
    setMeta((previous) => ({
      ...previous,
      [activeRadius]: {
        ...previous[activeRadius],
        loading: true,
      },
    }));

    fetchNearby(userId, campusId, activeRadius, controller.signal)
      .then((items) => {
        if (cancelled) {
          return;
        }
        items.forEach((item) => {
          if (item.is_friend) {
            friendIdsRef.current[item.user_id] = true;
          }
        });
        const nextUsers = withFriendFlags(items);
        setUsers(nextUsers);
        setMeta((previous) => ({
          ...previous,
          [activeRadius]: {
            count: items.length,
            loading: false,
            lastUpdated: Date.now(),
          },
        }));
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load nearby pulses.");
        setUsers([]);
        setMeta((previous) => ({
          ...previous,
          [activeRadius]: {
            count: null,
            loading: false,
            lastUpdated: Date.now(),
          },
        }));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeRadius, campusId, isDemoMode, isLiveMode, userId, withFriendFlags]);

  useEffect(() => {
    // Prefetch counts for outer radius once initial load finishes.
    const largerRadius = RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
    if (isDemoMode) {
      return undefined;
    }

    if (!isLiveMode) {
      return undefined;
    }

    if (activeRadius !== largerRadius && meta[largerRadius]?.count == null && !meta[largerRadius]?.loading) {
      const controller = new AbortController();
      const fetchKey = `${userId}:${campusId}:${largerRadius}`;
      const lastFetch = lastFetchRef.current[fetchKey];
      const now = Date.now();
      if (lastFetch && now - lastFetch < MIN_REFRESH_INTERVAL_MS) {
        return undefined;
      }
      lastFetchRef.current[fetchKey] = now;
      setMeta((previous) => ({
        ...previous,
        [largerRadius]: {
          ...previous[largerRadius],
          loading: true,
        },
      }));
      fetchNearby(userId, campusId, largerRadius, controller.signal)
        .then((items) => {
          setMeta((previous) => ({
            ...previous,
            [largerRadius]: {
              count: items.length,
              loading: false,
              lastUpdated: Date.now(),
            },
          }));
        })
        .catch(() => {
          setMeta((previous) => ({
            ...previous,
            [largerRadius]: {
              count: previous[largerRadius]?.count ?? null,
              loading: false,
              lastUpdated: Date.now(),
            },
          }));
        });
      return () => {
        controller.abort();
      };
    }
    return undefined;
  }, [activeRadius, campusId, isDemoMode, isLiveMode, meta, userId]);

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }
    if (!users.some((user) => user.user_id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [selectedUserId, users]);

  const handleRadiusChange = useCallback((radius: number) => {
    if (radius === activeRadius) {
      return;
    }
    setActiveRadius(radius);
    setSelectedUserId(null);
  }, [activeRadius]);

  const handleSelectUser = useCallback((user: NearbyUser) => {
    setSelectedUserId((previous) => (previous === user.user_id ? null : user.user_id));
  }, []);

  const handleInvite = useCallback(
    async (targetUserId: string) => {
      if (isDemoMode) {
        setInviteError("Sign up or log in to send invites.");
        return;
      }

      setInvitePendingId(targetUserId);
      setInviteError(null);
      setInviteMessage(null);
      if (inviteMessageTimer.current) {
        clearTimeout(inviteMessageTimer.current);
        inviteMessageTimer.current = null;
      }

      try {
        const summary = await sendInvite(userId, campusId, targetUserId);
        const accepted = summary.status === "accepted";
        if (accepted) {
          friendIdsRef.current[targetUserId] = true;
          friendMapReadyRef.current = true;
        }
        setUsers((previous) => {
          const updated = previous.map((user): NearbyUser =>
            user.user_id === targetUserId
              ? {
                  ...user,
                  invite_status: toNearbyInviteStatus(summary.status),
                  is_friend: accepted ? true : user.is_friend,
                }
              : user,
          );
          return withFriendFlags(updated);
        });
        const successMessage =
          accepted
            ? "Invite auto-accepted — you're connected!"
            : "Invite sent.";
        setInviteMessage(successMessage);
        inviteMessageTimer.current = setTimeout(() => {
          setInviteMessage(null);
          inviteMessageTimer.current = null;
        }, INVITE_SUCCESS_TIMEOUT_MS);
      } catch (err) {
        const detail = parseInviteErrorDetail(err);
        if (detail === "already_friends") {
          friendIdsRef.current[targetUserId] = true;
          friendMapReadyRef.current = true;
          setUsers((previous) => {
            const updated = previous.map((user): NearbyUser =>
              user.user_id === targetUserId
                ? {
                    ...user,
                    is_friend: true,
                    invite_status: "none",
                  }
                : user,
            );
            return withFriendFlags(updated);
          });
          setInviteError(null);
          const message = "You're already connected — open the chat to say hi.";
          setInviteMessage(message);
          inviteMessageTimer.current = setTimeout(() => {
            setInviteMessage(null);
            inviteMessageTimer.current = null;
          }, INVITE_SUCCESS_TIMEOUT_MS);
          return;
        }
        const fallbackMessage = detail
          ? detail
              .replace(/_/g, " ")
              .replace(/\b\w/g, (char) => char.toUpperCase())
          : err instanceof Error
            ? err.message
            : "Unable to send invite";
        setInviteError(fallbackMessage);
      } finally {
        setInvitePendingId(null);
      }
    },
    [campusId, isDemoMode, userId, withFriendFlags],
  );

  const handleToggleLiveMode = useCallback(async () => {
    if (isLiveProcessing) {
      return;
    }

    if (isLiveMode) {
      setIsLiveProcessing(true);
      setPresenceMessage("Passive mode enabled — you can browse anonymously.");
      setPresenceError(null);
      cleanupLiveMode();
      setIsLiveMode(false);
      setIsLiveProcessing(false);
      positionRef.current = null;
      lastFetchRef.current = {};
      setUsers([]);
      setMeta((previous) => ({
        ...previous,
        [activeRadius]: {
          ...previous[activeRadius],
          count: null,
          loading: false,
        },
      }));
      void sendOffline(userId, campusId);
      return;
    }

    setIsLiveProcessing(true);
    setPresenceMessage(null);
    setPresenceError(null);

    try {
      const position = isDemoMode ? createFallbackPosition() : await requestBrowserPosition();
      positionRef.current = position;
      setAccuracyM(position.coords.accuracy ?? null);

      await sendHeartbeat(position, userId, campusId, activeRadius);
      startHeartbeatLoop();

      if (!isDemoMode) {
        startWatchPosition();
      }

      lastFetchRef.current = {};
      setIsLiveMode(true);
      setPresenceMessage("You are visible on the map now — classmates can invite you in real time.");
    } catch (err) {
      setPresenceError(err instanceof Error ? err.message : "Unable to share your location");
      cleanupLiveMode();
    } finally {
      setIsLiveProcessing(false);
    }
  }, [
    activeRadius,
    campusId,
    cleanupLiveMode,
    isDemoMode,
    isLiveMode,
    isLiveProcessing,
    startHeartbeatLoop,
    startWatchPosition,
    userId,
  ]);

  useEffect(() => {
    if (!isLiveMode || !positionRef.current) {
      return;
    }

    let cancelled = false;

    const pushHeartbeat = async () => {
      try {
        await sendHeartbeat(positionRef.current as GeolocationPosition, userId, campusId, activeRadius);
        if (!cancelled) {
          setPresenceError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPresenceError(err instanceof Error ? err.message : "Unable to refresh location");
        }
      }
    };

    void pushHeartbeat();
    startHeartbeatLoop();

    return () => {
      cancelled = true;
    };
  }, [activeRadius, campusId, isLiveMode, startHeartbeatLoop, userId]);

  useEffect(() => {
    return () => {
      cleanupLiveMode();
      if (inviteMessageTimer.current) {
        clearTimeout(inviteMessageTimer.current);
        inviteMessageTimer.current = null;
      }
    };
  }, [campusId, cleanupLiveMode, userId]);

  const sectionClass = "flex w-full min-w-0 flex-col gap-5";
  const accessibilityProps = isLiveMode
    ? { "aria-pressed": "true" as const }
    : { "aria-pressed": "false" as const };

  const busyProps = isLiveProcessing
    ? { "aria-busy": "true" as const }
    : { "aria-busy": "false" as const };

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (!galleryPreviewImage) {
      if (lastFocusedElementRef.current) {
        lastFocusedElementRef.current.focus();
        lastFocusedElementRef.current = null;
      }
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setGalleryPreviewImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      galleryCloseButtonRef.current?.focus();
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [galleryPreviewImage]);

  const selectedUserInviteStatusLabel = selectedUser
    ? selectedUser.invite_status === "pending"
      ? "Invite pending"
      : selectedUser.invite_status === "incoming"
        ? "Invite received"
        : null
    : null;
  const selectedUserInitial = selectedUser
    ? (selectedUser.display_name || selectedUser.handle || "D").slice(0, 1).toUpperCase()
    : null;
  const galleryPreview = selectedUser?.gallery
    ? selectedUser.gallery.filter((item) => Boolean(item?.url)).slice(0, 4)
    : [];
  const selectedUserDisplayName = selectedUser?.display_name || selectedUser?.handle || "Divan member";

  return (
    <>
      <section className={`${sectionClass}${className ? ` ${className}` : ""}`}>
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,320px)_minmax(320px,340px)] xl:grid-cols-[minmax(280px,320px)_minmax(360px,400px)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">People nearby</h2>
              <span className="text-xs text-slate-500">
                {meta[activeRadius]?.count != null ? `${meta[activeRadius]?.count ?? 0} visible` : "Scanning"}
              </span>
            </div>
            {error ? (
              <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            ) : null}
            <div className="max-h-[15rem] overflow-y-auto pr-1">
              <NearbyList
                users={users}
                loading={loading || !friendsReady}
                error={error}
                selectedUserId={selectedUserId ?? undefined}
                onSelect={handleSelectUser}
                onInvite={handleInvite}
                invitePendingId={invitePendingId}
              />
            </div>
            <div className="text-xs" aria-live="polite">
              {inviteMessage ? <p className="text-emerald-600">{inviteMessage}</p> : null}
              {inviteError ? <p className="text-rose-600">{inviteError}</p> : null}
            </div>
          </div>

          {selectedUser ? (
            <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative h-16 w-16">
                  {selectedUser.avatar_url ? (
                    <Image
                      src={selectedUser.avatar_url}
                      alt={selectedUser.display_name || selectedUser.handle || "Divan member"}
                      fill
                      sizes="(max-width: 640px) 25vw, 120px"
                      className="rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-lg font-semibold text-slate-600">
                      {selectedUserInitial}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-100 shadow">
                    <span aria-hidden>●</span>
                    Live
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {selectedUser.display_name || selectedUser.handle || "Divan member"}
                    </h3>
                    {selectedUser.handle ? <span className="text-xs text-slate-500">@{selectedUser.handle}</span> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {selectedUserDistanceText ? <span>{selectedUserDistanceText}</span> : null}
                    {selectedUser.major ? <span>• {selectedUser.major}</span> : null}
                    {selectedUser.graduation_year ? <span>• ’{String(selectedUser.graduation_year).slice(-2)}</span> : null}
                    {selectedUser.last_activity ? <span>• {selectedUser.last_activity}</span> : null}
                  </div>
                  {selectedUserBio ? <p className="text-sm text-slate-600">{selectedUserBio}</p> : null}
                </div>
              </div>

              {selectedUserPassions.length ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">Passions</span>
                  <div className="flex flex-wrap gap-2">
                    {selectedUserPassions.map((passion) => (
                      <span
                        key={passion}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                      >
                        <span aria-hidden>★</span>
                        {passion}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">Gallery</span>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {galleryPreview.length
                    ? galleryPreview.map((item) => (
                        <button
                          type="button"
                          key={item.key ?? item.url ?? `${selectedUser.user_id}-gallery`}
                          onClick={(event) => {
                            lastFocusedElementRef.current = event.currentTarget;
                            setGalleryPreviewImage({
                              url: String(item.url ?? ""),
                              alt: `${selectedUserDisplayName} gallery preview`,
                            });
                          }}
                          className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                        >
                          <Image
                            src={String(item.url ?? "")}
                            alt={`${selectedUserDisplayName} gallery thumbnail`}
                            fill
                            sizes="(max-width: 640px) 22vw, 110px"
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <span className="sr-only">Open larger preview</span>
                        </button>
                      ))
                    : FALLBACK_GALLERY_BACKDROPS.slice(0, 4).map((backdrop, index) => (
                        <div
                          key={`fallback-${index}`}
                          className={`flex aspect-[4/5] items-center justify-center rounded-2xl bg-gradient-to-br ${backdrop} text-center text-xs font-semibold text-slate-600`}
                        >
                          Campus snapshot
                        </div>
                      ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {selectedUserInviteStatusLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[0.65rem] font-semibold text-amber-700">
                      <span aria-hidden>✨</span>
                      {selectedUserInviteStatusLabel}
                    </span>
                  ) : null}
                  {selectedUser.is_friend ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[0.65rem] font-semibold text-emerald-700">
                      <span aria-hidden>🤝</span>
                      Friend
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleLiveMode}
                  {...accessibilityProps}
                  {...busyProps}
                  disabled={isLiveProcessing}
                  className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    isLiveMode
                      ? "bg-emerald-500 text-slate-900 hover:bg-emerald-400 focus-visible:outline-emerald-600"
                      : "bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-slate-900"
                  }`}
                >
                  {isLiveMode ? "Switch to passive" : "Go live now"}
                </button>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide ${
                    isLiveMode
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isLiveMode ? "bg-emerald-500" : "bg-slate-500"}`}
                  />
                  {isLiveMode ? "Live mode" : "Passive mode"}
                </span>
              </div>
              <span className="text-xs text-slate-500">Pulse updates refresh every few seconds.</span>
            </div>
            <div className="flex flex-col gap-1 text-xs" aria-live="polite">
              {isLiveProcessing ? <p className="text-slate-500">Preparing your location…</p> : null}
              {presenceMessage ? <p className="text-emerald-600">{presenceMessage}</p> : null}
              {presenceError ? <p className="text-rose-600">{presenceError}</p> : null}
              {isLiveMode && accuracyM != null ? (
                <p className="text-slate-500">Location accuracy ≈{Math.round(accuracyM)}m</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-6">
              <RadiusDial
                options={RADIUS_OPTIONS}
                activeRadius={activeRadius}
                onRadiusChange={handleRadiusChange}
                meta={meta}
                loading={loading}
              />
              <MiniMap
                users={users}
                radius={activeRadius}
                selectedUserId={selectedUserId}
                onSelect={handleSelectUser}
              />
            </div>
          </div>
        </div>
      </div>
      </section>

      {galleryPreviewImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10"
          role="dialog"
          aria-modal="true"
          aria-label="Gallery image preview"
        >
          <div
            className="absolute inset-0 cursor-zoom-out bg-slate-900/70"
            onClick={() => setGalleryPreviewImage(null)}
            role="presentation"
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-3xl">
            <div className="relative overflow-hidden rounded-3xl bg-slate-950/90 shadow-2xl">
              <div className="relative h-[60vh] min-h-[320px] w-full">
                <Image
                  src={galleryPreviewImage.url}
                  alt={galleryPreviewImage.alt}
                  fill
                  sizes="(max-width: 768px) 90vw, 1024px"
                  className="object-contain"
                />
              </div>
              <button
                type="button"
                ref={galleryCloseButtonRef}
                onClick={() => setGalleryPreviewImage(null)}
                className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 text-slate-100 transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-100"
              >
                <span aria-hidden>X</span>
                <span className="sr-only">Close preview</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
