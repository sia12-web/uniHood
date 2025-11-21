"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Radar from "@/components/proximity/Radar";
import { NearbyList } from "@/app/proximity/components/NearbyList";
import { applyDiff } from "@/lib/diff";
import { formatDistance } from "@/lib/geo";
import { emitInviteCountRefresh } from "@/hooks/social/use-invite-count";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { getBackendUrl } from "@/lib/env";
import {
  disconnectPresenceSocket,
  getPresenceSocket,
  onPresenceSocketStatus,
  getPresenceSocketStatus,
  initialiseNearbyAccumulator,
  applyNearbyEvent,
  nearbyAccumulatorToArray,
} from "@/lib/socket";
import { getOrCreateIdemKey } from "@/app/api/idempotency";
import { fetchFriends, sendInvite } from "@/lib/social";
import { FRIENDSHIP_FORMED_EVENT, emitFriendshipFormed } from "@/lib/friends-events";
import { fetchPublicProfile } from "@/lib/profiles";
import {
  LOCATION_PERMISSION_MESSAGE,
  requestBrowserPosition,
  sendHeartbeat,
  sendOffline,
} from "@/lib/presence/api";
import type { NearbyDiff, NearbyUser, ProfileGalleryImage, PublicProfile } from "@/lib/types";
import { useSocketStatus } from "@/app/lib/socket/useStatus";

type HomeProximityPreviewProps = {
  rightRail?: ReactNode;
  variant?: "full" | "mini";
  autoLive?: boolean;
};

type ProfileWithGallery = PublicProfile & { gallery?: ProfileGalleryImage[] };

type NearbyProfileState = {
  profile: ProfileWithGallery | null;
  loading: boolean;
  error: string | null;
};

// Config parallels /proximity page
const BACKEND_URL = getBackendUrl();
const RADIUS_MIN = 10;
const RADIUS_MAX = 300;
const RADIUS_STEP = 10;
const HEARTBEAT_VISIBLE_MS = 2000;
const HEARTBEAT_HIDDEN_MS = 6000;
const GO_LIVE_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_GO_LIVE === "true";

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

export default function HomeProximityPreview({ rightRail, variant = "full", autoLive = false }: HomeProximityPreviewProps) {
  const [radius, setRadius] = useState<number>(100);
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authEvaluated, setAuthEvaluated] = useState(false);
  const [presenceStatus, setPresenceStatus] = useState<string | null>(null);
  const [isLiveMode, setIsLiveMode] = useState<boolean>(false);
  const [invitePendingId, setInvitePendingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [profileStates, setProfileStates] = useState<Record<string, NearbyProfileState>>({});
  const [peopleViewMode, setPeopleViewMode] = useState<"list" | "swipe">("list");
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const sentInitialHeartbeat = useRef(false);
  const profileCacheRef = useRef<Map<string, ProfileWithGallery>>(new Map());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const router = useRouter();

  const nearbyStateRef = useRef(initialiseNearbyAccumulator<NearbyUser>());
  const usersRef = useRef<NearbyUser[]>([]);
  const positionRef = useRef<GeolocationPosition | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [heartbeatSeconds, setHeartbeatSeconds] = useState<number>(HEARTBEAT_VISIBLE_MS / 1000);

  // Hydrate auth
  useEffect(() => {
    setAuthUser(readAuthUser());
    setAuthEvaluated(true);
    const cleanup = onAuthChange(() => {
      setAuthUser(readAuthUser());
      setAuthEvaluated(true);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (activeUserId && !users.some((entry) => entry.user_id === activeUserId)) {
      setActiveUserId(null);
    }
  }, [activeUserId, users]);

  useEffect(() => {
    if (!users.length) {
      return;
    }
    setUsers((prev) => {
      let mutated = false;
      const next = prev.map((entry) => {
        if (entry.is_friend || !friendIds.has(entry.user_id)) {
          return entry;
        }
        mutated = true;
        return { ...entry, is_friend: true };
      });
      if (mutated) {
        usersRef.current = next;
        nearbyStateRef.current = applyNearbyEvent(initialiseNearbyAccumulator<NearbyUser>(), {
          items: next,
        });
        return next;
      }
      return prev;
    });
  }, [friendIds, users.length]);

  const currentUserId = authUser?.userId ?? null;
  const currentCampusId = authUser?.campusId ?? null;
  const goLiveAllowed = GO_LIVE_ENABLED && Boolean(currentUserId && currentCampusId);
  const presenceSocketStatus = useSocketStatus(onPresenceSocketStatus, getPresenceSocketStatus);
  const showReconnectBanner =
    isLiveMode && (presenceSocketStatus === "reconnecting" || presenceSocketStatus === "connecting");
  const showDisconnectedBanner = isLiveMode && presenceSocketStatus === "disconnected";

  const loadFriends = useCallback(async () => {
    if (!authEvaluated || !currentUserId || !currentCampusId) {
      return;
    }
    try {
      const rows = await fetchFriends(currentUserId, currentCampusId, "accepted");
      setFriendIds(() => new Set(rows.map((row) => row.friend_id)));
    } catch {
      // ignored; we fall back to invite state if fetch fails
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
      if (isLiveMode) {
        return;
      }
      setActiveUserId(null);
      setProfileStates({});
      setPeopleViewMode("list");
      setSwipeIndex(0);
      nearbyStateRef.current = initialiseNearbyAccumulator<NearbyUser>();
      usersRef.current = [];
      profileCacheRef.current.clear();
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
    }, [isLiveMode]);

    useEffect(() => {
      void loadFriends();
    }, [loadFriends]);

    useEffect(() => {
      nearbyStateRef.current = initialiseNearbyAccumulator<NearbyUser>();
      usersRef.current = [];
    }, [radius, currentCampusId]);

  useEffect(() => {
    setSwipeIndex((prev) => {
      if (users.length === 0) {
        return 0;
      }
      return Math.min(prev, users.length - 1);
    });
  }, [users.length]);

  useEffect(() => {
    if (peopleViewMode === "swipe" && users.length === 0) {
      setPeopleViewMode("list");
    }
  }, [peopleViewMode, users.length]);

  // Socket lifecycle
  const socket = useMemo(() => {
    if (!authEvaluated || !isLiveMode || !currentUserId || !currentCampusId) {
      disconnectPresenceSocket();
      return null;
    }
    disconnectPresenceSocket();
    return getPresenceSocket(currentUserId, currentCampusId);
  }, [authEvaluated, currentUserId, currentCampusId, isLiveMode]);

  useEffect(() => {
    if (!socket || !isLiveMode) {
      return;
    }
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
        setActiveUserId((current) =>
          current && patched.some((entry) => entry.user_id === current) ? current : null,
        );
        return patched;
      });
    };
    const handleNearby = (payload: { cursor?: string | null; items?: NearbyUser[] }) => {
      nearbyStateRef.current = applyNearbyEvent(nearbyStateRef.current, payload);
      const ordered = nearbyAccumulatorToArray(nearbyStateRef.current);
      const patched = withFriendStatus(ordered);
      usersRef.current = patched;
      setUsers(patched);
      setActiveUserId((current) =>
        current && patched.some((entry) => entry.user_id === current) ? current : null,
      );
    };
    socket.on("nearby:update", handleUpdate);
    socket.on("presence:nearby", handleNearby);
    socket.emit("nearby:subscribe", { campus_id: currentCampusId, radius_m: radius });
    return () => {
      socket.off("nearby:update", handleUpdate);
      socket.off("presence:nearby", handleNearby);
      socket.emit("nearby:unsubscribe", { campus_id: currentCampusId, radius_m: radius });
    };
  }, [socket, radius, currentCampusId, isLiveMode, withFriendStatus]);

  useEffect(() => () => disconnectPresenceSocket(), []);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  const refreshNearby = useCallback(async () => {
    if (!authEvaluated) {
      return;
    }
    if (!isLiveMode) {
      setUsers([]);
      usersRef.current = [];
      nearbyStateRef.current = initialiseNearbyAccumulator<NearbyUser>();
      setLoading(false);
      setActiveUserId(null);
      setProfileStates({});
      return;
    }
    if (!currentUserId || !currentCampusId) {
      setError("Sign in to discover nearby classmates.");
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
      setActiveUserId((prev) => (prev && patched.some((entry) => entry.user_id === prev) ? prev : null));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load nearby classmates.";
      const friendly =
        message.startsWith("Nearby request failed") || message.includes("presence not found")
          ? "No nearby classmates yet. Try widening your range."
          : message;
      setError(friendly);
    } finally {
      setLoading(false);
    }
  }, [authEvaluated, currentCampusId, currentUserId, radius, isLiveMode, withFriendStatus]);

  // Initial nearby fetch
  useEffect(() => {
    if (!authEvaluated || !isLiveMode) {
      if (!isLiveMode) {
        setUsers([]);
        usersRef.current = [];
        nearbyStateRef.current = initialiseNearbyAccumulator<NearbyUser>();
        setLoading(false);
        setActiveUserId(null);
        setProfileStates({});
      }
      return;
    }
    void refreshNearby();
  }, [authEvaluated, isLiveMode, refreshNearby]);

  // Offline on unload
  useEffect(() => {
    if (!authEvaluated) {
      return;
    }
    let called = false;
    const goOffline = () => {
      if (called) return;
      called = true;
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      try {
        disconnectPresenceSocket();
      } catch {}
      if (currentUserId && currentCampusId) {
        void sendOffline(currentUserId, currentCampusId);
      }
    };
    window.addEventListener("beforeunload", goOffline);
    window.addEventListener("pagehide", goOffline);
    return () => {
      window.removeEventListener("beforeunload", goOffline);
      window.removeEventListener("pagehide", goOffline);
    };
  }, [authEvaluated, currentUserId, currentCampusId]);

  const primeHeartbeat = useCallback(() => {
    if (!authEvaluated || !goLiveAllowed || !isLiveMode) return;
    if (!positionRef.current || sentInitialHeartbeat.current) return;
    sentInitialHeartbeat.current = true;
    sendHeartbeat(positionRef.current, currentUserId, currentCampusId, radius).catch((err) => {
      sentInitialHeartbeat.current = false;
      setError(err instanceof Error ? err.message : "Heartbeat failed");
    });
  }, [authEvaluated, currentCampusId, currentUserId, radius, goLiveAllowed, isLiveMode]);

  const handleGoLive = useCallback(async () => {
    if (!authEvaluated) {
      return;
    }
    setPresenceStatus(null);
    if (!goLiveAllowed || !currentUserId || !currentCampusId) {
      const msg = "Sign in to share your live presence.";
      setError(msg);
      setLocationNotice(msg);
      return;
    }
    if (!positionRef.current) {
      try {
        positionRef.current = await requestBrowserPosition();
        setLocationNotice(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : LOCATION_PERMISSION_MESSAGE;
        setError(message);
        setLocationNotice(message);
        return;
      }
    }
    try {
      await sendHeartbeat(positionRef.current, currentUserId, currentCampusId, radius);
      sentInitialHeartbeat.current = true;
      setPresenceStatus("You're visible on the map — others nearby can see you now.");
      setError(null);
      setIsLiveMode(true);
    } catch (err) {
      setPresenceStatus(null);
      setError(err instanceof Error ? err.message : "Unable to share your location");
      setIsLiveMode(false);
    }
  }, [authEvaluated, currentCampusId, currentUserId, radius, goLiveAllowed]);

  const handleToggleLiveMode = useCallback(async () => {
    if (!authEvaluated) {
      return;
    }
    if (isLiveMode) {
      setIsLiveMode(false);
      setPresenceStatus("Passive mode enabled - you're hidden from the map.");
      sentInitialHeartbeat.current = false;
      positionRef.current = null;
      if (currentUserId && currentCampusId) {
        void sendOffline(currentUserId, currentCampusId);
      }
      setUsers([]);
      usersRef.current = [];
      nearbyStateRef.current = initialiseNearbyAccumulator<NearbyUser>();
      setLoading(false);
      return;
    }
    await handleGoLive();
  }, [authEvaluated, currentCampusId, currentUserId, handleGoLive, isLiveMode]);

  useEffect(() => {
    if (loading) return;
    if (autoLive && !isLiveMode) {
      void handleToggleLiveMode();
    } else if (!autoLive && isLiveMode) {
      void handleToggleLiveMode();
    }
  }, [autoLive, handleToggleLiveMode, isLiveMode, loading]);

  // Kick heartbeat once ready
  useEffect(() => {
    if (!authEvaluated || !isLiveMode) return;
    if (!positionRef.current || sentInitialHeartbeat.current) return;
    primeHeartbeat();
  }, [authEvaluated, isLiveMode, primeHeartbeat]);

  // Geolocation watch
  useEffect(() => {
    if (!authEvaluated || !isLiveMode) {
      return;
    }
    if (!goLiveAllowed) {
      setLocationNotice("Live presence is temporarily disabled.");
      return;
    }
    if (!currentUserId || !currentCampusId) {
      setLocationNotice("Sign in to enable live discovery.");
      return;
    }
    if (!navigator.geolocation) {
      setError("Geolocation unsupported");
      return;
    }
    let isResolved = false;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        positionRef.current = pos;
        sentInitialHeartbeat.current = false;
        setLocationNotice(null);
        isResolved = true;
        primeHeartbeat();
      },
      (err) => {
        if (process.env.NODE_ENV !== "production") console.warn("Geolocation unavailable", err);
        if (!positionRef.current || !isResolved) {
          setLocationNotice("Location blocked. Please allow location access to appear on the map.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [authEvaluated, currentCampusId, currentUserId, goLiveAllowed, primeHeartbeat, isLiveMode]);

  // Heartbeat interval management
  useEffect(() => {
    if (!authEvaluated || !isLiveMode) {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      return;
    }
    if (!goLiveAllowed) {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      return;
    }
    const schedule = () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      const visible = document.visibilityState === "visible";
      const interval = visible ? HEARTBEAT_VISIBLE_MS : HEARTBEAT_HIDDEN_MS;
      setHeartbeatSeconds(interval / 1000);
      heartbeatTimer.current = setInterval(() => {
        if (positionRef.current && isLiveMode && currentUserId && currentCampusId) {
          sendHeartbeat(positionRef.current, currentUserId, currentCampusId, radius).catch((err) => {
            setError(err.message);
          });
        }
      }, interval);
    };
    schedule();
    const vis = () => schedule();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, [authEvaluated, radius, currentCampusId, currentUserId, goLiveAllowed, isLiveMode]);

  const handleInvite = useCallback(
    async (targetUserId: string) => {
      if (!authEvaluated) {
        setInviteError("Presence is still loading. Please try again in a moment.");
        return;
      }
      setInviteMessage(null);
      setInviteError(null);
      setInvitePendingId(targetUserId);
      try {
        const payload = {
          to_user_id: targetUserId,
          campus_id: currentCampusId,
        } as const;
        const idemKey = await getOrCreateIdemKey("/invites/send", payload);
        const summary = await sendInvite(currentUserId, currentCampusId, targetUserId, { idemKey });
        if (summary.status === "accepted") {
          setInviteMessage("Invite auto-accepted - you're now friends!");
          setUsers((prev) => prev.map((u) => (u.user_id === targetUserId ? { ...u, is_friend: true } : u)));
          setFriendIds((prev) => {
            if (prev.has(targetUserId)) {
              return prev;
            }
            const next = new Set(prev);
            next.add(targetUserId);
            return next;
          });
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
    [authEvaluated, currentCampusId, currentUserId],
  );

  const handleChat = useCallback(
    (targetUserId: string) => {
      router.push(`/chat/${targetUserId}`);
    },
    [router],
  );

  const requestProfileForEntry = useCallback(
    (entry: NearbyUser) => {
      if (!entry) {
        return;
      }
      if (profileCacheRef.current.has(entry.user_id)) {
        const cached = profileCacheRef.current.get(entry.user_id)!;
        setProfileStates((prev) => ({
          ...prev,
          [entry.user_id]: { profile: cached, loading: false, error: null },
        }));
        return;
      }
      if (!entry.handle) {
        setProfileStates((prev) => ({
          ...prev,
          [entry.user_id]: {
            profile: prev[entry.user_id]?.profile ?? null,
            loading: false,
            error: "Profile unavailable",
          },
        }));
        return;
      }
      setProfileStates((prev) => ({
        ...prev,
        [entry.user_id]: { profile: prev[entry.user_id]?.profile ?? null, loading: true, error: null },
      }));
      controllersRef.current.get(entry.user_id)?.abort();
      const controller = new AbortController();
      controllersRef.current.set(entry.user_id, controller);
      fetchPublicProfile(entry.handle, {
        userId: currentUserId,
        campusId: currentCampusId,
        signal: controller.signal,
      })
        .then((profile) => {
          if (controller.signal.aborted) {
            return;
          }
          const enriched = profile as ProfileWithGallery;
          profileCacheRef.current.set(entry.user_id, enriched);
          setProfileStates((prev) => ({
            ...prev,
            [entry.user_id]: { profile: enriched, loading: false, error: null },
          }));
        })
        .catch((err) => {
          if (controller.signal.aborted) {
            return;
          }
          setProfileStates((prev) => ({
            ...prev,
            [entry.user_id]: {
              profile: prev[entry.user_id]?.profile ?? null,
              loading: false,
              error: err instanceof Error ? err.message : "Failed to load profile",
            },
          }));
        })
        .finally(() => {
          controllersRef.current.delete(entry.user_id);
        });
    },
    [currentCampusId, currentUserId],
  );

  const handleSelectUser = useCallback(
    (entry: NearbyUser) => {
      setActiveUserId((current) => {
        const nextSelected = current === entry.user_id ? null : entry.user_id;
        if (nextSelected) {
          requestProfileForEntry(entry);
        }
        return nextSelected;
      });
    },
    [requestProfileForEntry],
  );

  const handleSelectUserById = useCallback(
    (userId: string) => {
      const entry = users.find((item) => item.user_id === userId);
      if (!entry) {
        return;
      }
      handleSelectUser(entry);
    },
    [handleSelectUser, users],
  );

  const handleSwipeNext = useCallback(() => {
    setSwipeIndex((prev) => {
      const length = usersRef.current.length;
      if (!length) {
        return 0;
      }
      return (prev + 1) % length;
    });
  }, []);

  const handleSwipePrev = useCallback(() => {
    setSwipeIndex((prev) => {
      const length = usersRef.current.length;
      if (!length) {
        return 0;
      }
      return (prev - 1 + length) % length;
    });
  }, []);

  useEffect(() => {
    if (!isLiveMode || peopleViewMode !== "swipe") {
      return;
    }
    const current = users[swipeIndex];
    if (current) {
      requestProfileForEntry(current);
    }
  }, [isLiveMode, peopleViewMode, requestProfileForEntry, swipeIndex, users]);

  const friendCount = useMemo(() => users.filter((entry) => entry.is_friend).length, [users]);
  const newFacesCount = Math.max(0, users.length - friendCount);
  const radarStats = useMemo(
    () => [
      {
        label: "Friends in range",
        value: friendCount,
        accent: "text-emerald-300",
        border: "border-emerald-500/30",
      },
      {
        label: "New faces",
        value: newFacesCount,
        accent: "text-rose-300",
        border: "border-rose-500/30",
      },
      {
        label: "Heartbeat",
        value: `${heartbeatSeconds}s`,
        accent: "text-sky-300",
        border: "border-sky-500/30",
      },
    ],
    [friendCount, newFacesCount, heartbeatSeconds],
  );

  useEffect(() => {
    if (!authEvaluated || typeof window === "undefined" || !isLiveMode) {
      return;
    }
    const handleFriendship: EventListener = (event) => {
      const detail = (event as CustomEvent<{ peerId?: string }>).detail;
      const peerId = detail?.peerId;
      if (!peerId) {
        void refreshNearby();
        return;
      }
      let seen = false;
      let mutated = false;
      setUsers((prev) => {
        if (!prev.length) {
          return prev;
        }
        const next = prev.map((entry) => {
          if (entry.user_id === peerId) {
            seen = true;
            if (entry.is_friend) {
              return entry;
            }
            mutated = true;
            return { ...entry, is_friend: true };
          }
          return entry;
        });
        return mutated ? next : prev;
      });
      setFriendIds((prev) => {
        if (prev.has(peerId)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(peerId);
        return next;
      });
      if (!seen || !mutated) {
        void refreshNearby();
      }
    };
    window.addEventListener(FRIENDSHIP_FORMED_EVENT, handleFriendship);
    return () => {
      window.removeEventListener(FRIENDSHIP_FORMED_EVENT, handleFriendship);
    };
  }, [authEvaluated, refreshNearby, isLiveMode]);

  const gridColumnsClass = rightRail
    ? "lg:grid-cols-[minmax(0,300px)_minmax(0,1.4fr)_minmax(0,240px)] xl:grid-cols-[minmax(0,320px)_minmax(0,1.8fr)_minmax(0,280px)] 2xl:grid-cols-[minmax(0,340px)_minmax(0,2fr)_minmax(0,300px)]"
    : "lg:grid-cols-[minmax(0,340px)_minmax(0,1.9fr)] xl:grid-cols-[minmax(0,360px)_minmax(0,2.2fr)] 2xl:grid-cols-[minmax(0,380px)_minmax(0,2.4fr)]";

  const liveToggleAriaProps = isLiveMode
    ? { "aria-pressed": "true" as const }
    : { "aria-pressed": "false" as const };

  const totalUsers = users.length;
  const safeSwipeIndex = totalUsers ? Math.min(swipeIndex, totalUsers - 1) : 0;
  const swipeUser = isLiveMode && totalUsers ? users[safeSwipeIndex] ?? null : null;
  const swipeProfileState = swipeUser ? profileStates[swipeUser.user_id] : undefined;

  if (variant === "mini") {
    return (
      <section className="flex flex-col gap-3 rounded-[32px] border border-slate-900/40 bg-[#040a19] p-4 text-slate-100 shadow-[0_18px_40px_rgba(4,10,25,0.5)]">
        <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.35em] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${isLiveMode ? "bg-emerald-400" : "bg-slate-500"}`} />
            Live mini-map
          </span>
          <span className="font-medium normal-case tracking-normal text-slate-300">
            Showing first {users.length} {users.length === 1 ? "peer" : "peers"}
          </span>
        </div>
        <div className="rounded-[28px] border border-white/5 bg-gradient-to-b from-[#0d1425] to-[#050b19] p-3">
          {isLiveMode ? (
            <Radar users={users} radius={radius} onSelect={handleSelectUserById} activeUserId={activeUserId} />
          ) : (
            <div className="flex h-64 items-center justify-center text-center text-xs text-slate-400">
              Go live to activate the radar view.
            </div>
          )}
        </div>
        <p className="text-[0.65rem] text-slate-500">Tap a pulse to preview profile details and send a quick invite.</p>
      </section>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 rounded-3xl border border-warm-sand bg-white/80 p-6 shadow-soft">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-midnight">Nearby on Campus</h2>
        <p className="text-xs text-navy/70">
          Heartbeats refresh every {heartbeatSeconds}s while this tab stays active.
        </p>
      </header>
      {showReconnectBanner ? (
        <p className="rounded-2xl bg-slate-100 px-4 py-2 text-xs text-slate-700" role="status" aria-live="polite">
          Reconnecting…
        </p>
      ) : null}
      {showDisconnectedBanner ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-2 text-xs text-rose-700" role="alert" aria-live="assertive">
          Connection lost. Trying to reconnect…
        </p>
      ) : null}
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => void handleToggleLiveMode()}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white shadow transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60 ${
              isLiveMode ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-900 hover:bg-slate-800"
            }`}
            disabled={!goLiveAllowed}
            {...liveToggleAriaProps}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${isLiveMode ? "bg-white" : "bg-emerald-200"}`}
            />
            {isLiveMode ? "Switch to passive mode" : "Go live now"}
          </button>
          <span className="text-xs text-slate-500">
            Pulse updates refresh every {heartbeatSeconds}s while this tab is visible.
          </span>
        </div>
        {presenceStatus ? (
          <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700" aria-live="polite">
            {presenceStatus}
          </p>
        ) : null}
        {locationNotice ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{locationNotice}</p>
        ) : null}
        {error ? <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-slate-500">
              Discovery radius
            </span>
            <span className="text-sm font-semibold text-slate-900">{radius}m</span>
          </div>
          <input
            type="range"
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={RADIUS_STEP}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
            aria-label="Discovery radius"
          />
          <div className="flex items-center justify-between text-[0.55rem] uppercase tracking-wide text-slate-400">
            <span>Closer</span>
            <span>Wider</span>
          </div>
          <p className="text-[0.7rem] text-slate-500" aria-live="polite">
            {loading ? "Refreshing nearby pulses…" : `${users.length} nearby pulse${users.length === 1 ? "" : "s"}`}
          </p>
        </div>
        </section>
        <div className={`grid gap-4 ${gridColumnsClass}`}>
        <section className="order-2 flex h-full flex-col gap-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-soft lg:order-1">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">People nearby</h3>
              <span className="text-xs text-slate-500">{loading ? "Updating…" : `${users.length} in range`}</span>
            </div>
            <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold text-slate-500">
              <button
                type="button"
                onClick={() => setPeopleViewMode("list")}
                className={`rounded-full px-3 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  peopleViewMode === "list" ? "bg-white text-slate-900 shadow" : "text-slate-500"
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setPeopleViewMode("swipe")}
                className={`rounded-full px-3 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  peopleViewMode === "swipe" ? "bg-white text-slate-900 shadow" : "text-slate-500"
                } ${!isLiveMode || totalUsers === 0 ? "opacity-40" : ""}`}
                disabled={!isLiveMode || totalUsers === 0}
                title={!isLiveMode ? "Go live to enable swipe view" : totalUsers === 0 ? "No nearby classmates yet" : "View one profile at a time"}
              >
                Swipe
              </button>
            </div>
          </header>
          {inviteMessage ? (
            <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700" aria-live="polite">
              {inviteMessage}
            </p>
          ) : null}
          {inviteError ? <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{inviteError}</p> : null}
          {!isLiveMode ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-slate-500">
              Go live to discover classmates nearby.
            </div>
          ) : peopleViewMode === "swipe" ? (
            <NearbySwipeDeck
              user={swipeUser}
              profileState={swipeProfileState}
              count={users.length}
              currentIndex={users.length ? safeSwipeIndex + 1 : 0}
              loading={loading}
              invitePendingId={invitePendingId}
              onInvite={handleInvite}
              onChat={handleChat}
              onNext={handleSwipeNext}
              onPrev={handleSwipePrev}
            />
          ) : (
            <div className="flex-1 overflow-y-auto pr-1">
              <NearbyList
                users={users}
                loading={loading}
                error={error}
                onInvite={handleInvite}
                invitePendingId={invitePendingId}
                onChat={handleChat}
                onSelect={handleSelectUser}
                selectedUserId={activeUserId}
                profileStates={profileStates}
              />
            </div>
          )}
        </section>
        <section className="order-1 flex flex-col gap-4 rounded-[32px] border border-slate-900/40 bg-[#040a19] p-5 text-slate-100 shadow-[0_20px_45px_rgba(4,10,25,0.55)] lg:order-2">
          <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">
            <span className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${isLiveMode ? "bg-emerald-400" : "bg-slate-600"}`} />
              Live mini-map
            </span>
            <div className="text-right normal-case tracking-normal text-slate-300">
              <p>Showing first {users.length} {users.length === 1 ? "peer" : "peers"}</p>
              <p className="text-[0.6rem] text-slate-500">Radius {radius}m</p>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/5 bg-gradient-to-b from-[#0d1425] to-[#050b19] p-4">
            {isLiveMode ? (
              <Radar users={users} radius={radius} onSelect={handleSelectUserById} activeUserId={activeUserId} />
            ) : (
              <div className="flex h-64 items-center justify-center text-center text-xs text-slate-400">
                Go live to activate the radar view.
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {radarStats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl border ${stat.border} bg-white/5 px-3 py-2 text-center backdrop-blur`}
              >
                <p className={`text-[0.55rem] uppercase tracking-[0.35em] ${stat.accent}`}>{stat.label}</p>
                <p className="text-xl font-semibold text-white">{stat.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[0.65rem] text-slate-400">
            Tap a pulse to preview profile details and send a quick invite.
          </p>
        </section>
        {rightRail ? (
          <aside className="order-3 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-soft">
            {rightRail}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

type NearbySwipeDeckProps = {
  user: NearbyUser | null;
  profileState?: NearbyProfileState;
  count: number;
  currentIndex: number;
  loading: boolean;
  invitePendingId?: string | null;
  onInvite?: (userId: string) => void;
  onChat?: (userId: string) => void;
  onNext: () => void;
  onPrev: () => void;
};

function NearbySwipeDeck({
  user,
  profileState,
  count,
  currentIndex,
  loading,
  invitePendingId,
  onInvite,
  onChat,
  onNext,
  onPrev,
}: NearbySwipeDeckProps) {
  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
        {loading ? "Scanning for nearby classmates…" : "No pulses in your radius yet. Try widening your range."}
      </div>
    );
  }

  const username = user.display_name || user.handle || "Unknown";
  const profile = profileState?.profile ?? null;
  const profileLoading = profileState?.loading ?? false;
  const profileError = profileState?.error ?? null;
  const passions = profile?.interests ?? [];
  const bioText = profile?.bio?.trim() ?? "";
  const bioContent = profileLoading && !bioText
    ? "Loading profile…"
    : profileError && !bioText
      ? profileError
      : bioText || "This classmate hasn’t shared a bio yet.";
  const majorLabel = user.major?.trim() || profile?.program?.trim() || "Major not shared";
  const yearLabel = profile?.year ? `Class of ${profile.year}` : "Year not shared";
  const distanceLabel = formatDistance(user.distance_m ?? null);
  const avatarUrl = profile?.avatar_url || user.avatar_url || null;
  const canInvite = Boolean(onInvite) && !user.is_friend;
  const canChat = Boolean(onChat) && Boolean(user.is_friend);

  return (
    <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 p-4 shadow-inner">
      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">
        <span>Swipe deck</span>
        <span className="text-slate-500">{count ? `${currentIndex} / ${count}` : "0 / 0"}</span>
      </div>
      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-slate-900/5 lg:flex-1">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={`${username} featured photo`}
              fill
              sizes="(max-width: 768px) 100vw, 45vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 text-4xl font-semibold text-slate-500">
              {username.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent p-4 text-white">
            <p className="text-lg font-semibold leading-tight">{username}</p>
            <p className="text-xs text-white/80">{majorLabel}</p>
            <p className="text-[0.6rem] uppercase tracking-[0.4em] text-white/70">{distanceLabel} away</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 rounded-3xl border border-slate-100 bg-white/90 p-4">
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-slate-400">Bio</p>
            <p className={`mt-2 text-sm ${profileLoading && !bioText ? "text-slate-500" : profileError && !bioText ? "text-rose-600" : "text-slate-600"}`}>
              {bioContent}
            </p>
          </div>
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-slate-400">Passions</p>
            {passions.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {passions.slice(0, 8).map((passion) => (
                  <span key={passion} className="rounded-full bg-amber-100 px-3 py-0.5 text-[0.65rem] font-medium text-amber-800">
                    {passion}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {profileLoading ? "Loading passions…" : profileError ?? "No passions shared yet."}
              </p>
            )}
          </div>
          <div className="grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
            <div>
              <p className="text-[0.55rem] uppercase tracking-[0.35em] text-slate-400">Major</p>
              <p className="mt-1 font-semibold text-slate-900">{majorLabel}</p>
            </div>
            <div>
              <p className="text-[0.55rem] uppercase tracking-[0.35em] text-slate-400">Year</p>
              <p className="mt-1 font-semibold text-slate-900">{yearLabel}</p>
            </div>
            <div>
              <p className="text-[0.55rem] uppercase tracking-[0.35em] text-slate-400">Distance</p>
              <p className="mt-1 font-semibold text-slate-900">{distanceLabel}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:flex-none sm:px-6"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-900/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 sm:flex-none sm:px-6"
        >
          Swap card
        </button>
        {canChat && onChat ? (
          <button
            type="button"
            onClick={() => onChat(user.user_id)}
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400 sm:flex-none sm:px-6"
          >
            Chat
          </button>
        ) : null}
        {canInvite && onInvite ? (
          <button
            type="button"
            onClick={() => onInvite(user.user_id)}
            disabled={invitePendingId === user.user_id}
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:px-6"
          >
            {invitePendingId === user.user_id ? "Sending…" : "Wave hello"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
