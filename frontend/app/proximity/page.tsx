"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NearbyList } from "./components/NearbyList";
import GoLiveStrip from "@/components/proximity/GoLiveStrip";
import { applyDiff } from "@/lib/diff";
import { getBackendUrl, getDemoCampusId, getDemoUserId } from "@/lib/env";
import { disconnectPresenceSocket, getPresenceSocket } from "@/lib/socket";
import { sendInvite } from "@/lib/social";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import {
  LOCATION_PERMISSION_MESSAGE,
  createFallbackPosition,
  requestBrowserPosition,
  sendHeartbeat,
  sendOffline,
} from "@/lib/presence/api";
import type { NearbyDiff, NearbyUser } from "@/lib/types";

const BACKEND_URL = getBackendUrl();
const RADIUS_OPTIONS = [10, 50, 100];
const HEARTBEAT_VISIBLE_MS = 2000;
const HEARTBEAT_HIDDEN_MS = 6000;
const GO_LIVE_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_GO_LIVE === "true";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();
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
    } catch {
      detail = null;
    }

    if (response.status === 400 && detail === "presence not found") {
      return [];
    }

    const suffix = detail ? ` - ${detail}` : "";
    throw new Error(`Nearby request failed (${response.status})${suffix}`);
  }

  const body = await response.json();
  return body.items as NearbyUser[];
}


export default function ProximityPage() {
  const [radius, setRadius] = useState<number>(50);
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [invitePendingId, setInvitePendingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [presenceStatus, setPresenceStatus] = useState<string | null>(null);
  const [lastFetchCount, setLastFetchCount] = useState<number | null>(null);
  const sentInitialHeartbeat = useRef(false);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);

  const positionRef = useRef<GeolocationPosition | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [heartbeatSeconds, setHeartbeatSeconds] = useState<number>(HEARTBEAT_VISIBLE_MS / 1000);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setAuthUser(readAuthUser());

    // In demo mode we seed a fallback position; in real mode we require geolocation.
    const demoMode = (readAuthUser()?.campusId ?? DEMO_CAMPUS_ID) === DEMO_CAMPUS_ID;
    if (demoMode && !positionRef.current) {
      positionRef.current = createFallbackPosition();
      setAccuracyM(50);
      setLocationNotice("Using demo location. Enable location access for real positioning.");
    }

    const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
    return cleanup;
  }, []);

  const currentUserId = authUser?.userId ?? DEMO_USER_ID;
  const currentCampusId = authUser?.campusId ?? DEMO_CAMPUS_ID;
  const isDemoMode = currentCampusId === DEMO_CAMPUS_ID;
  const goLiveAllowed = GO_LIVE_ENABLED || isDemoMode;

  const socket = useMemo(() => {
    disconnectPresenceSocket();
    return getPresenceSocket(currentUserId, currentCampusId);
  }, [currentUserId, currentCampusId]);

  useEffect(() => {
    const handleUpdate = (payload: NearbyDiff) => {
      setUsers((prev) => applyDiff(prev, payload, radius));
    };

    socket.on("nearby:update", handleUpdate);
    socket.emit("nearby:subscribe", { campus_id: currentCampusId, radius_m: radius });

    return () => {
      socket.off("nearby:update", handleUpdate);
      socket.emit("nearby:unsubscribe", { campus_id: currentCampusId, radius_m: radius });
    };
  }, [socket, radius, currentCampusId]);

  useEffect(() => () => disconnectPresenceSocket(), []);

  useEffect(() => {
    setLoading(true);

    fetchNearby(currentUserId, currentCampusId, radius)
      .then((items) => {
        setUsers(items);
        setLastFetchCount(items.length);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [radius, currentCampusId, currentUserId]);

  // Best-effort: when the tab is closed or navigated away, mark user offline immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let called = false;
    const goOffline = () => {
      if (called) return;
      called = true;
      // stop heartbeats
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
      }
      // disconnect socket
      try { disconnectPresenceSocket(); } catch {}
      // notify server
      void sendOffline(currentUserId, currentCampusId);
    };
    const handleBeforeUnload = () => goOffline();
    const handlePageHide = () => goOffline();
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [currentUserId, currentCampusId]);

  const refreshNearby = useCallback(() => {
    setLoading(true);
    fetchNearby(currentUserId, currentCampusId, radius)
      .then((items) => {
        setUsers(items);
        setLastFetchCount(items.length);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [currentUserId, currentCampusId, radius]);

  const primeHeartbeat = useCallback(() => {
    if (!goLiveAllowed) {
      return;
    }

    if (!positionRef.current || sentInitialHeartbeat.current) {
      return;
    }

    sentInitialHeartbeat.current = true;
    sendHeartbeat(positionRef.current, currentUserId, currentCampusId, radius).catch((err) => {
      sentInitialHeartbeat.current = false;
      setError(err instanceof Error ? err.message : "Heartbeat failed");
    });
  }, [currentCampusId, currentUserId, radius, goLiveAllowed]);

  const handleGoLive = useCallback(async () => {
    setPresenceStatus(null);

    if (!goLiveAllowed) {
      const disabledMessage = "Live presence is temporarily disabled.";
      setError(disabledMessage);
      setLocationNotice(disabledMessage);
      return;
    }

    if (!positionRef.current) {
      if (isDemoMode) {
        positionRef.current = createFallbackPosition();
        setLocationNotice("Using demo location. Enable location access for real positioning.");
      } else {
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
    }

    const position = positionRef.current;

    try {
      await sendHeartbeat(position, currentUserId, currentCampusId, radius);
      sentInitialHeartbeat.current = true;
      setPresenceStatus("You’re visible on the map—others nearby can see you now.");
      setError(null);
    } catch (err) {
      setPresenceStatus(null);
      setError(err instanceof Error ? err.message : "Unable to share your location");
    }
  }, [currentCampusId, currentUserId, radius, goLiveAllowed, isDemoMode]);

  useEffect(() => {
    if (!positionRef.current || sentInitialHeartbeat.current) {
      return;
    }
    primeHeartbeat();
  }, [primeHeartbeat]);

  useEffect(() => {
    if (!goLiveAllowed) {
      setLocationNotice("Live presence is temporarily disabled.");
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
        if (typeof pos.coords?.accuracy === "number") {
          setAccuracyM(Math.round(pos.coords.accuracy));
        }
        sentInitialHeartbeat.current = false;
        setLocationNotice(null);
        isResolved = true;
        primeHeartbeat();
      },
      (err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Geolocation unavailable", err);
        }

        if (isDemoMode) {
          if (!positionRef.current || !isResolved) {
            positionRef.current = createFallbackPosition();
            setAccuracyM(50);
          }
          sentInitialHeartbeat.current = false;
          setLocationNotice("Using demo location. Enable location access for real positioning.");
          primeHeartbeat();
        } else {
          // Real campus: do not fall back to demo coordinates; require permission
          setLocationNotice("Location blocked. Please allow location access to appear on the map.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [goLiveAllowed, primeHeartbeat, isDemoMode]);

  useEffect(() => {
    if (!goLiveAllowed) {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      return;
    }

    const scheduleHeartbeat = () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
      }

      const visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
      const interval = visible ? HEARTBEAT_VISIBLE_MS : HEARTBEAT_HIDDEN_MS;
      setHeartbeatSeconds(interval / 1000);

      heartbeatTimer.current = setInterval(() => {
        if (positionRef.current) {
          sendHeartbeat(positionRef.current, currentUserId, currentCampusId, radius).catch((err) => {
            setError(err.message);
          });
        }
      }, interval);
    };

    scheduleHeartbeat();

    const handleVisibility = () => scheduleHeartbeat();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
      }
    };
  }, [radius, currentCampusId, currentUserId, goLiveAllowed]);

  const handleInvite = useCallback(
    async (targetUserId: string) => {
      setInviteMessage(null);
      setInviteError(null);
      setInvitePendingId(targetUserId);

      try {
        const summary = await sendInvite(currentUserId, currentCampusId, targetUserId);

        if (summary.status === "accepted") {
          setInviteMessage("Invite auto-accepted - you're now friends!");
          setUsers((prev) =>
            prev.map((user) => (user.user_id === targetUserId ? { ...user, is_friend: true } : user)),
          );
        } else {
          setInviteMessage("Invite sent.");
        }
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : "Failed to send invite");
      } finally {
        setInvitePendingId(null);
      }
    },
    [currentCampusId, currentUserId],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Nearby on Campus</h1>
        <p className="text-sm text-slate-600">Heartbeats fire every {heartbeatSeconds}s based on tab visibility.</p>
      </header>

      {currentCampusId === DEMO_CAMPUS_ID ? (
        <p className="rounded bg-blue-100 px-3 py-2 text-sm text-blue-800">
          You are in demo mode (demo campus). You will only see other demo users. Sign in to your account in this
          browser to join your real campus and see classmates.
        </p>
      ) : null}

      {process.env.NODE_ENV !== "production" ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">debug: user={currentUserId} campus={currentCampusId} radius={radius}m fetched={lastFetchCount ?? "-"}</p>
          <button type="button" onClick={refreshNearby} className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700">Refresh</button>
        </div>
      ) : null}

      {locationNotice ? (
        <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-800">{locationNotice}</p>
      ) : null}

      {inviteError ? (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{inviteError}</p>
      ) : null}

      {inviteMessage ? (
        <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{inviteMessage}</p>
      ) : null}

          <GoLiveStrip
            enabled={goLiveAllowed}
            heartbeatSeconds={heartbeatSeconds}
            radius={radius}
            radiusOptions={RADIUS_OPTIONS}
            accuracyM={accuracyM}
            presenceStatus={presenceStatus}
            onRadiusChange={setRadius}
            onGoLive={handleGoLive}
          />

      <section className="grow">
        <NearbyList
          users={users}
          loading={loading}
          error={error}
          onInvite={handleInvite}
          invitePendingId={invitePendingId}
        />
      </section>
    </main>
  );
}
