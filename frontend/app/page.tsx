"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
import GoLiveStrip from "@/components/proximity/GoLiveStrip";
import { NearbyList } from "@/app/proximity/components/NearbyList";
import { clearAuthSnapshot, onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { applyDiff } from "@/lib/diff";
import { getBackendUrl, getDemoCampusId, getDemoUserId } from "@/lib/env";
import { isRecentlyLive, LOCATION_PERMISSION_MESSAGE, createFallbackPosition, requestBrowserPosition, sendHeartbeat, sendOffline } from "@/lib/presence/api";
import { disconnectPresenceSocket, getPresenceSocket } from "@/lib/socket";
import { sendInvite } from "@/lib/social";
import type { NearbyDiff, NearbyUser } from "@/lib/types";

// MVP header: no nav; show Join in/Sign in for guests, Profile/Sign out for members

const BACKEND_URL = getBackendUrl();
const RADIUS_OPTIONS = [10, 50, 100];
const HEARTBEAT_VISIBLE_MS = 2000;
const HEARTBEAT_HIDDEN_MS = 6000;
const GO_LIVE_FLAG = process.env.NEXT_PUBLIC_ENABLE_GO_LIVE === "true";
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

export default function HomePage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [liveNow, setLiveNow] = useState(false);

  // Proximity state (embedded on home)
  const [radius, setRadius] = useState<number>(50);
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [invitePendingId, setInvitePendingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [presenceStatus, setPresenceStatus] = useState<string | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [heartbeatSeconds, setHeartbeatSeconds] = useState<number>(HEARTBEAT_VISIBLE_MS / 1000);
  const [lastFetchCount, setLastFetchCount] = useState<number | null>(null);

  const positionRef = useRef<GeolocationPosition | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentInitialHeartbeat = useRef(false);

  useEffect(() => {
    setAuthUser(readAuthUser());
    const unsubscribe = onAuthChange(() => setAuthUser(readAuthUser()));
    setHydrated(true);
    return () => unsubscribe();
  }, []);

  // Live badge polling
  useEffect(() => {
    if (!GO_LIVE_FLAG) {
      setLiveNow(false);
      return;
    }
    const update = () => setLiveNow(isRecentlyLive());
    update();
    const id = window.setInterval(update, 15000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "divan:lastHeartbeatAt") update();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleSignOut = useCallback(() => {
    clearAuthSnapshot();
    setAuthUser(null);
  }, []);

  const currentUserId = authUser?.userId ?? DEMO_USER_ID;
  const currentCampusId = authUser?.campusId ?? DEMO_CAMPUS_ID;
  const isDemoMode = currentCampusId === DEMO_CAMPUS_ID;
  const goLiveAllowed = (process.env.NODE_ENV !== "production" || GO_LIVE_FLAG) || isDemoMode;

  // Socket wiring for diff updates
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

  // Initial and radius-changed fetch
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

  // Best-effort offline on unload
  useEffect(() => {
    if (typeof window === "undefined") return;
    let called = false;
    const goOffline = () => {
      if (called) return;
      called = true;
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      try { disconnectPresenceSocket(); } catch {}
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

  const primeHeartbeat = useCallback(() => {
    if (!goLiveAllowed) return;
    if (!positionRef.current || sentInitialHeartbeat.current) return;
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
        setAccuracyM(50);
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

  // Geolocation watcher
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
          setLocationNotice("Location blocked. Please allow location access to appear on the map.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [goLiveAllowed, primeHeartbeat, isDemoMode]);

  // Heartbeat scheduling based on tab visibility
  useEffect(() => {
    if (!goLiveAllowed) {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      return;
    }

    const scheduleHeartbeat = () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
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
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
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
          setUsers((prev) => prev.map((u) => (u.user_id === targetUserId ? { ...u, is_friend: true } : u)));
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
    <main className="relative flex min-h-screen flex-col bg-aurora">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(77,208,225,0.28)_0%,_rgba(255,255,255,0)_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(255,209,102,0.25)_0%,_rgba(255,255,255,0)_60%)]" />
      <header className="relative border-b border-warm-sand/70 bg-glass shadow-soft">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <BrandLogo withWordmark />
          <div className="hidden items-center gap-3 md:flex">
            {hydrated && authUser ? (
              <>
                <Link
                  href="/me"
                  className="rounded-full border border-warm-sand px-4 py-2 text-sm font-semibold text-navy transition hover:bg-warm-sand hover:text-midnight"
                >
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy"
                >
                  Sign out
                </button>
              </>
            ) : hydrated ? (
              <>
                <Link
                  href="/onboarding"
                  className="rounded-full border border-warm-sand px-4 py-2 text-sm font-semibold text-navy transition hover:bg-warm-sand hover:text-midnight"
                >
                  Join in
                </Link>
                <Link
                  href="/login"
                  className="rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy"
                >
                  Sign in
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* Embedded proximity on homepage */}
      <section className="relative mx-auto w-full max-w-6xl px-4 py-8">
        {/* Badge under title, replaces previous marketing sections */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-navy">Home</h1>
          {GO_LIVE_FLAG ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              {liveNow ? "Live now" : "Go Live available"}
            </span>
          ) : null}
        </div>

        {locationNotice ? (
          <p className="mb-3 rounded bg-amber-100 px-3 py-2 text-sm text-amber-800">{locationNotice}</p>
        ) : null}
        {inviteError ? (
          <p className="mb-3 rounded bg-red-100 px-3 py-2 text-sm text-red-800">{inviteError}</p>
        ) : null}
        {inviteMessage ? (
          <p className="mb-3 rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{inviteMessage}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: People nearby */}
          <div className="lg:col-span-4">
            <div className="rounded-3xl border border-warm-sand bg-white/70 p-4 shadow-soft">
              <h2 className="mb-3 text-lg font-semibold text-navy">People nearby</h2>
              <NearbyList
                users={users}
                loading={loading}
                error={error}
                onInvite={handleInvite}
                invitePendingId={invitePendingId}
              />
            </div>
          </div>

          {/* Center: Mini map placeholder + controls */}
          <div className="lg:col-span-4">
            <div className="rounded-3xl border border-warm-sand bg-glass p-4 shadow-soft">
              <h2 className="mb-3 text-lg font-semibold text-navy">Mini map</h2>
              <div className="mb-4 h-64 w-full rounded-2xl border border-warm-sand/60 bg-white/60" />
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
              {process.env.NODE_ENV !== "production" ? (
                <p className="mt-2 text-xs text-navy/60">
                  debug: user={currentUserId} campus={currentCampusId} radius={radius}m fetched={lastFetchCount ?? "-"}
                </p>
              ) : null}
            </div>
          </div>

          {/* Right: Friends + Chats quick links */}
          <div className="lg:col-span-4">
            <div className="flex flex-col gap-4">
              <div className="rounded-3xl border border-warm-sand bg-white/70 p-4 shadow-soft">
                <h3 className="mb-2 text-base font-semibold text-navy">Friends</h3>
                <p className="mb-3 text-sm text-navy/70">Manage your connections and invites.</p>
                <Link
                  href="/friends"
                  className="inline-block rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy"
                >
                  Open Friends
                </Link>
              </div>
              <div className="rounded-3xl border border-warm-sand bg-white/70 p-4 shadow-soft">
                <h3 className="mb-2 text-base font-semibold text-navy">Chats</h3>
                <p className="mb-3 text-sm text-navy/70">Catch up on conversations with classmates.</p>
                <Link
                  href="/chat"
                  className="inline-block rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy"
                >
                  Open Chats
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
