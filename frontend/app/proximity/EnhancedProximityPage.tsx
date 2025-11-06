"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActivityPreview } from "./components/ActivityPreview";
import { InviteTemplates } from "./components/InviteTemplates";
import { LiveModeToggle } from "./components/LiveModeToggle";
import { MiniMap } from "./components/MiniMap";
import { NearbyList } from "./components/NearbyList";
import { RadiusPanel } from "./components/RadiusPanel";
import { applyDiff } from "@/lib/diff";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import {
  getBackendUrl,
  getDemoCampusId,
  getDemoLatitude,
  getDemoLongitude,
  getDemoUserId,
} from "@/lib/env";
import { canSendHeartbeat, clampHeartbeatAccuracy } from "@/lib/geo";
import { emitProximityMetric } from "@/lib/obs/proximity";
import { fetchProfile } from "@/lib/identity";
import { disconnectPresenceSocket, getPresenceSocket } from "@/lib/socket";
import { sendInvite } from "@/lib/social";
import type { InviteSummary, NearbyDiff, NearbyUser, ProfileRecord } from "@/lib/types";

const BACKEND_URL = getBackendUrl();
const RADIUS_OPTIONS = [10, 20, 50, 200] as const;
const HEARTBEAT_VISIBLE_MS = 2000;
const HEARTBEAT_HIDDEN_MS = 6000;
const MAX_NEARBY_RETRY = 3;
const QUICK_INVITE_TEMPLATES = [
  "Want to join a study sprint?",
  "Up for a mini game?",
  "Need a quick coffee chat?",
];
const LOCATION_PERMISSION_MESSAGE = "Location permission needed to go live. Please allow location access in your browser.";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();
const DEMO_LAT = getDemoLatitude();
const DEMO_LON = getDemoLongitude();

type ActivityInsight = {
  id: string;
  name: string;
  participants: number;
  emoji?: string;
  description?: string;
};

type RadiusMeta = {
  count: number | null;
  loading: boolean;
  lastUpdated?: number;
};

type PresenceMode = "live" | "passive";

type RadiusSuggestion = {
  radius: number;
  message: string;
};

function toNearbyInviteStatus(status: InviteSummary["status"]): "pending" | "incoming" | "none" {
  return status === "sent" ? "pending" : "none";
}

function confidenceFromAccuracy(accuracy: number | null, radius: number): number | null {
  if (accuracy == null) {
    return null;
  }
  if (accuracy <= Math.max(10, radius * 0.25)) {
    return 92;
  }
  if (accuracy <= radius * 0.5) {
    return 78;
  }
  if (accuracy <= radius) {
    return 60;
  }
  if (accuracy <= radius * 1.5) {
    return 40;
  }
  return 20;
}

function buildRadiusSuggestion(activeRadius: number, meta: Record<number, RadiusMeta>): RadiusSuggestion | null {
  const activeMeta = meta[activeRadius];
  if (!activeMeta || activeMeta.loading) {
    return null;
  }
  const activeCount = activeMeta.count ?? 0;
  if (activeCount >= 3) {
    return null;
  }
  const largerOption = RADIUS_OPTIONS.find((option) => option > activeRadius && !meta[option]?.loading);
  if (!largerOption) {
    return null;
  }
  const nextCount = meta[largerOption]?.count ?? 0;
  if (nextCount <= activeCount) {
    return null;
  }
  const delta = nextCount - activeCount;
  return {
    radius: largerOption,
    message: `Expand to ${largerOption}m to see ${delta} more classmate${delta === 1 ? "" : "s"}.`,
  };
}

function createFallbackPosition(): GeolocationPosition {
  const coords = {
    latitude: DEMO_LAT,
    longitude: DEMO_LON,
    accuracy: 50,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      return {
        latitude: DEMO_LAT,
        longitude: DEMO_LON,
        accuracy: 50,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      };
    },
  } as unknown as GeolocationCoordinates;
  return {
    coords,
    timestamp: Date.now(),
  } as GeolocationPosition;
}

async function fetchNearby(userId: string, campusId: string, radius: number): Promise<NearbyUser[]> {
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

    if (response.status === 429) {
      const err = new Error(detail ?? "Too many nearby requests");
      (err as { code?: string }).code = "RATE_LIMIT";
      throw err;
    }

    const suffix = detail ? ` - ${detail}` : "";
    throw new Error(`Nearby request failed (${response.status})${suffix}`);
  }

  const body = await response.json();
  return Array.isArray(body?.items) ? (body.items as NearbyUser[]) : [];
}

async function fetchNearbyWithRetry(userId: string, campusId: string, radius: number): Promise<NearbyUser[]> {
  let attempt = 0;
  let lastError: unknown = null;
  while (attempt < MAX_NEARBY_RETRY) {
    try {
      return await fetchNearby(userId, campusId, radius);
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === "RATE_LIMIT") {
        throw err;
      }
      lastError = err;
      attempt += 1;
      if (attempt >= MAX_NEARBY_RETRY) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to load nearby users");
}

async function fetchNearbyActivities(userId: string, campusId: string, radius: number): Promise<ActivityInsight[]> {
  const url = new URL("/proximity/activities", BACKEND_URL);
  url.searchParams.set("campus_id", campusId);
  url.searchParams.set("radius_m", String(radius));
  const response = await fetch(url.toString(), {
    headers: {
      "X-User-Id": userId,
      "X-Campus-Id": campusId,
    },
  });

  if (!response.ok) {
    // Activities endpoint is not implemented on the backend yet.
    // Quietly ignore 404s to avoid noisy console errors until the API exists.
    if (response.status === 404) {
      return [];
    }
    // Treat other errors as genuine failures
    throw new Error(`Activity pulse failed (${response.status})`);
  }
  const body = await response.json();
  if (!Array.isArray(body?.items)) {
    return [];
  }
  return (body.items as Array<Record<string, unknown>>).map((item, index) => {
    const name =
      typeof item.name === "string"
        ? item.name
        : typeof item.kind === "string"
        ? item.kind
        : "Campus activity";
    const participants = typeof item.participants === "number" ? item.participants : 0;
    return {
      id: typeof item.id === "string" ? item.id : `${name}-${index}`,
      name,
      participants,
      emoji: typeof item.emoji === "string" ? item.emoji : "🎯",
      description: typeof item.description === "string" ? item.description : undefined,
    };
  });
}

async function sendHeartbeat(
  position: GeolocationPosition,
  userId: string,
  campusId: string,
  radius: number,
) {
  const rawAccuracy = position.coords.accuracy;

  if (!canSendHeartbeat(rawAccuracy)) {
    throw new Error("Location unavailable");
  }

  const payload = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy_m: clampHeartbeatAccuracy(rawAccuracy),
    campus_id: campusId,
    device_id: "web",
    ts_client: Date.now(),
    radius_m: radius,
  };

  const response = await fetch(`${BACKEND_URL}/presence/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
      "X-Campus-Id": campusId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Heartbeat failed (${response.status})`);
  }
}

async function sendOffline(userId: string, campusId: string) {
  try {
    await fetch(`${BACKEND_URL}/presence/offline`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
        "X-Campus-Id": campusId,
      },
    });
  } catch {
    // best-effort
  }
}

function calculateTrustScore(profile: ProfileRecord | null): number | null {
  if (!profile) return null;
  const checks = [
    Boolean(profile.avatar_url),
    (profile.handle ?? "").trim().length >= 3,
    (profile.bio ?? "").trim().length >= 40,
    (profile.passions ?? []).length >= 3,
    (profile.status?.text ?? "").trim().length > 0,
    (profile.major ?? "").trim().length > 0,
    Boolean(profile.graduation_year),
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export default function EnhancedProximityPage() {
  // ----- State -----
  const [radius, setRadius] = useState<number>(50);
  const [hasLivePresence, setHasLivePresence] = useState<boolean>(false);
  const [usersByRadius, setUsersByRadius] = useState<Record<number, NearbyUser[]>>(() => {
    const map: Record<number, NearbyUser[]> = {};
    RADIUS_OPTIONS.forEach((option) => {
      map[option] = [];
    });
    return map;
  });
  const [radiusMeta, setRadiusMeta] = useState<Record<number, RadiusMeta>>(() => {
    const meta: Record<number, RadiusMeta> = {};
    RADIUS_OPTIONS.forEach((option) => {
      meta[option] = { count: null, loading: true };
    });
    return meta;
  });
  const [radiusErrors, setRadiusErrors] = useState<Record<number, string | null>>(() => {
    const errors: Record<number, string | null> = {};
    RADIUS_OPTIONS.forEach((option) => {
      errors[option] = null;
    });
    return errors;
  });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitePendingId, setInvitePendingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [presenceStatus, setPresenceStatus] = useState<string | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [presenceMode, setPresenceMode] = useState<PresenceMode>("passive");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [ghostModeEnabled, setGhostModeEnabled] = useState<boolean>(false);
  const [trustScore, setTrustScore] = useState<number | null>(null);
  const [trustHint, setTrustHint] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityInsight[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState<boolean>(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [radiusCooldownUntil, setRadiusCooldownUntil] = useState<number | null>(null);

  // ----- Refs -----
  const positionRef = useRef<GeolocationPosition | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inviteMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geoWatchId = useRef<number | null>(null);
  const radiusCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatInFlight = useRef<boolean>(false);

  // ----- Auth + online status -----
  useEffect(() => {
    if (typeof window === "undefined") return;

    setAuthUser(readAuthUser());
    setIsOnline(window.navigator.onLine);

    const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      cleanup();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const currentUserId = authUser?.userId ?? DEMO_USER_ID;
  const currentCampusId = authUser?.campusId ?? DEMO_CAMPUS_ID;
  const isDemoMode = currentCampusId === DEMO_CAMPUS_ID;

  const confidencePercent = useMemo(() => confidenceFromAccuracy(accuracyM, radius), [accuracyM, radius]);
  const radiusSuggestion = useMemo(() => buildRadiusSuggestion(radius, radiusMeta), [radius, radiusMeta]);
  const currentListError = radiusErrors[radius] ?? null;
  const isRadiusCoolingDown = useMemo(() => radiusCooldownUntil != null, [radiusCooldownUntil]);
  const radiusCooldownMessage = isRadiusCoolingDown
    ? "Cooling down to avoid rate limits. Try another radius in a few seconds."
    : null;

  const startRadiusCooldown = useCallback((durationMs: number = 4000) => {
    if (radiusCooldownTimer.current) {
      clearTimeout(radiusCooldownTimer.current);
      radiusCooldownTimer.current = null;
    }
    const expiresAt = Date.now() + durationMs;
    setRadiusCooldownUntil(expiresAt);
    radiusCooldownTimer.current = setTimeout(() => {
      setRadiusCooldownUntil(null);
      radiusCooldownTimer.current = null;
      setError((prev) => {
        if (!prev) {
          return prev;
        }
        if (
          prev === "You're checking nearby too quickly. Please wait a few seconds before trying again." ||
          prev === "Give the discovery radius a moment before switching again."
        ) {
          return null;
        }
        return prev;
      });
      setRadiusErrors((prev) => {
        const next = { ...prev };
        RADIUS_OPTIONS.forEach((option) => {
          if (next[option] === "Cooling down after too many quick requests.") {
            next[option] = null;
          }
        });
        return next;
      });
    }, durationMs);
  }, [setError, setRadiusErrors]);

  const handleGeoSuccess = useCallback(
    (position: GeolocationPosition) => {
      positionRef.current = position;
      const rawAccuracy = position.coords.accuracy;
      const nextAccuracy = Number.isFinite(rawAccuracy) ? Math.round(rawAccuracy) : null;
      setAccuracyM(nextAccuracy);
      setLocationNotice(null);
      setError((prev) => {
        if (!prev) {
          return prev;
        }
        if (
          prev === LOCATION_PERMISSION_MESSAGE ||
          prev === "Unable to determine your location. Check device location services and try again." ||
          prev === "Unable to refresh your location right now. We will keep trying."
        ) {
          return null;
        }
        return prev;
      });
    },
    [setAccuracyM, setError, setLocationNotice],
  );

  const requestBrowserPosition = useCallback((): Promise<GeolocationPosition> => {
    if (typeof window === "undefined" || typeof window.navigator === "undefined" || !window.navigator.geolocation) {
      return Promise.reject(new Error("geolocation_unavailable"));
    }
    return new Promise<GeolocationPosition>((resolve, reject) => {
      window.navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      });
    });
  }, []);

  // ----- Profile (ghost mode + trust score) -----
  useEffect(() => {
    if (!authUser?.userId) {
      setGhostModeEnabled(false);
      setTrustScore(null);
      return;
    }
    let cancelled = false;
    fetchProfile(authUser.userId, authUser.campusId ?? null)
      .then((profile) => {
        if (cancelled) return;
        setGhostModeEnabled(Boolean(profile.privacy?.ghost_mode));
        setTrustScore(calculateTrustScore(profile));
      })
      .catch(() => {
        if (!cancelled) setGhostModeEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  // ----- Demo location seed -----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const demoMode = (readAuthUser()?.campusId ?? DEMO_CAMPUS_ID) === DEMO_CAMPUS_ID;
    if (demoMode && !positionRef.current) {
      positionRef.current = createFallbackPosition();
      setAccuracyM(50);
      setLocationNotice("Using demo location. Enable location access for real positioning.");
    }
  }, []);

  // ----- Socket -----
  const socket = useMemo(() => {
    // Only connect sockets when in live mode to avoid unnecessary WS noise
    if (presenceMode !== "live") {
      disconnectPresenceSocket();
      return null;
    }
    return getPresenceSocket(currentUserId, currentCampusId);
  }, [currentUserId, currentCampusId, presenceMode]);

  useEffect(() => {
    const handleUpdate = (payload: NearbyDiff) => {
      let nextList: NearbyUser[] = [];
      setUsersByRadius((prev) => {
        const prior = prev[payload.radius_m] ?? [];
        nextList = applyDiff(prior, payload, payload.radius_m);
        return { ...prev, [payload.radius_m]: nextList };
      });
      setRadiusMeta((prev) => ({
        ...prev,
        [payload.radius_m]: {
          count: nextList.length,
          loading: false,
          lastUpdated: Date.now(),
        },
      }));
    };

    if (!socket) return;
    socket.on("nearby:update", handleUpdate);
    RADIUS_OPTIONS.forEach((option) => {
      socket.emit("nearby:subscribe", { campus_id: currentCampusId, radius_m: option });
    });

    return () => {
      if (!socket) return;
      socket.off("nearby:update", handleUpdate);
      RADIUS_OPTIONS.forEach((option) => {
        socket.emit("nearby:unsubscribe", { campus_id: currentCampusId, radius_m: option });
      });
    };
  }, [socket, currentCampusId]);

  useEffect(() => () => disconnectPresenceSocket(), []);

  useEffect(() => () => {
    if (radiusCooldownTimer.current) {
      clearTimeout(radiusCooldownTimer.current);
      radiusCooldownTimer.current = null;
    }
  }, []);

  // ----- Heartbeat priming -----
  const primeHeartbeat = useCallback(() => {
    if (!positionRef.current || presenceMode !== "live" || heartbeatInFlight.current) return;

    heartbeatInFlight.current = true;
    sendHeartbeat(positionRef.current, currentUserId, currentCampusId, radius)
      .then(() => {
        setHasLivePresence(true);
      })
      .catch((err) => {
        setHasLivePresence(false);
        setError(err instanceof Error ? err.message : "Heartbeat failed");
      })
      .finally(() => {
        heartbeatInFlight.current = false;
      });
  }, [currentCampusId, currentUserId, radius, presenceMode]);

  const handleRadiusChange = useCallback(
    (nextRadius: number) => {
      if (nextRadius === radius) {
        return;
      }
      if (isRadiusCoolingDown) {
        setError("Give the discovery radius a moment before switching again.");
        return;
      }
      setRadius(nextRadius);
      setSelectedUserId(null);
      emitProximityMetric({ event: "radius_change", radius: nextRadius, live: presenceMode === "live" });
    },
    [isRadiusCoolingDown, presenceMode, radius, setError],
  );

  const handleSuggestionClick = useCallback(
    (nextRadius: number) => {
      handleRadiusChange(nextRadius);
    },
    [handleRadiusChange],
  );

  const handleSelectUser = useCallback((user: NearbyUser) => {
    setSelectedUserId((prev) => (prev === user.user_id ? null : user.user_id));
  }, []);

  const handleExplainTrust = useCallback(() => {
    if (trustScore == null) {
      setTrustHint("Complete your profile details to build trust in live proximity.");
      return;
    }
    if (trustScore >= 80) {
      setTrustHint("Awesome — a polished profile keeps you featured in live mode.");
    } else if (trustScore >= 50) {
      setTrustHint("Add a bit more detail (bio, passions, photo) to boost your trust score.");
    } else {
      setTrustHint("Finish your bio, passions, and avatar to earn more trust with classmates.");
    }
  }, [trustScore]);

  const handleDismissTrustHint = useCallback(() => {
    setTrustHint(null);
  }, []);

  const handleLaunchActivity = useCallback((activity: ActivityInsight) => {
    emitProximityMetric({ event: "activity_launch", kind: activity.name, participants: activity.participants });
    setPresenceStatus(`Opening "${activity.name}" — classmates will see it shortly.`);
  }, []);

  // Heartbeat interval management (depends on visibility)
  useEffect(() => {
    if (presenceMode !== "live") {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      return;
    }

    const intervalMs = document.hidden ? HEARTBEAT_HIDDEN_MS : HEARTBEAT_VISIBLE_MS;

    heartbeatTimer.current = setInterval(() => {
      primeHeartbeat();
    }, intervalMs);

    return () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
    };
  }, [presenceMode, primeHeartbeat]);

  useEffect(() => {
    if (typeof window === "undefined" || isDemoMode) {
      return;
    }
    if (!window.navigator?.geolocation) {
      setLocationNotice("Location services are unavailable in this browser.");
      return;
    }
    if (presenceMode !== "live") {
      if (geoWatchId.current != null) {
        window.navigator.geolocation.clearWatch(geoWatchId.current);
        geoWatchId.current = null;
      }
      return;
    }

    const geo = window.navigator.geolocation;

    const handleError = (err: GeolocationPositionError) => {
      const permissionDenied = err.code === 1;
      positionRef.current = null;
      setAccuracyM(null);
      if (permissionDenied) {
  setError(LOCATION_PERMISSION_MESSAGE);
  setPresenceMode("passive");
  setHasLivePresence(false);
  heartbeatInFlight.current = false;
        setPresenceStatus(null);
        setLocationNotice("Location access is blocked. Update your browser settings to allow location, then try again.");
        void sendOffline(currentUserId, currentCampusId);
      } else {
  setError("Unable to refresh your location right now. We will keep trying.");
  setLocationNotice("Unable to refresh your location. Check device location services and try again.");
      }
      heartbeatInFlight.current = false;
      if (geoWatchId.current != null) {
        geo.clearWatch(geoWatchId.current);
        geoWatchId.current = null;
      }
    };

    geoWatchId.current = geo.watchPosition(handleGeoSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });

    return () => {
      if (geoWatchId.current != null) {
        geo.clearWatch(geoWatchId.current);
        geoWatchId.current = null;
      }
    };
  }, [
    currentCampusId,
    currentUserId,
    handleGeoSuccess,
    isDemoMode,
    presenceMode,
    setAccuracyM,
    setError,
    setLocationNotice,
    setPresenceMode,
    setPresenceStatus,
  ]);

  // ----- Invites -----
  const updateInviteState = useCallback((targetUserId: string, summary: InviteSummary) => {
    setUsersByRadius((prev) => {
      const next = { ...prev };
      RADIUS_OPTIONS.forEach((option) => {
        next[option] = (next[option] ?? []).map((user) => {
          if (user.user_id !== targetUserId) {
            return user;
          }
          const inviteStatus = toNearbyInviteStatus(summary.status);
          return {
            ...user,
            invite_status: inviteStatus,
            is_friend: summary.status === "accepted" ? true : user.is_friend,
          };
        });
      });
      return next;
    });
  }, []);

  const handleInvite = useCallback(
    async (targetUserId: string) => {
      setInvitePendingId(targetUserId);
      setInviteError(null);
      if (inviteMessageTimer.current) {
        clearTimeout(inviteMessageTimer.current);
        inviteMessageTimer.current = null;
      }
      try {
        const summary = await sendInvite(currentUserId, currentCampusId, targetUserId, {
          note: selectedTemplate ?? undefined,
        });
        updateInviteState(targetUserId, summary);
        const successMessage = summary.status === "accepted"
          ? "Invite auto-accepted — you're now connected!"
          : selectedTemplate
            ? `Invite sent with “${selectedTemplate}”.`
            : "Invite sent.";
        setInviteMessage(successMessage);
        inviteMessageTimer.current = setTimeout(() => setInviteMessage(null), 3500);
        emitProximityMetric({
          event: "invite_send",
          target: targetUserId,
          template: selectedTemplate ?? null,
        });
      } catch (err) {
        setInviteError(err instanceof Error ? err.message : "Unable to send invite");
      } finally {
        setInvitePendingId(null);
      }
    },
    [currentCampusId, currentUserId, selectedTemplate, updateInviteState],
  );

  // ----- Presence mode toggle -----
  const enterLiveMode = useCallback(async () => {
    setPresenceStatus(null);
    if (!positionRef.current) {
      if (isDemoMode) {
        positionRef.current = createFallbackPosition();
        setAccuracyM(50);
        setLocationNotice("Using demo location. Enable location access for real positioning.");
      } else {
        try {
          const freshPosition = await requestBrowserPosition();
          handleGeoSuccess(freshPosition);
        } catch (err) {
          const code = typeof err === "object" && err !== null && "code" in err ? Number((err as { code: unknown }).code) : null;
          const permissionDenied = code === 1;
          positionRef.current = null;
          setAccuracyM(null);
          setError(
            permissionDenied
              ? LOCATION_PERMISSION_MESSAGE
              : "Unable to determine your location. Check device location services and try again.",
          );
          setLocationNotice(
            permissionDenied
              ? "Location access is blocked. Update your browser settings to allow location, then try again."
              : "Unable to determine your location. Check device location services and try again.",
          );
          return;
        }
      }
    }
    const position = positionRef.current;
    if (!position) {
      setError(LOCATION_PERMISSION_MESSAGE);
      return;
    }
    try {
      heartbeatInFlight.current = true;
      await sendHeartbeat(position, currentUserId, currentCampusId, radius);
      setHasLivePresence(true);
      setPresenceMode("live");
      setPresenceStatus("You are visible on the map now — classmates can invite you in real time.");
      setError(null);
      emitProximityMetric({ event: "mode_toggle", mode: "live" });
    } catch (err) {
      setHasLivePresence(false);
      setPresenceStatus(null);
      setPresenceMode("passive");
      setError(err instanceof Error ? err.message : "Unable to share your location");
    } finally {
      heartbeatInFlight.current = false;
    }
  }, [
    currentCampusId,
    currentUserId,
    handleGeoSuccess,
    isDemoMode,
    radius,
    requestBrowserPosition,
    setAccuracyM,
    setError,
    setLocationNotice,
    setPresenceMode,
    setPresenceStatus,
  ]);

  const handleModeToggle = useCallback(
    (nextMode: "live" | "passive") => {
      if (nextMode === "live") {
        void enterLiveMode();
        return;
      }
      setPresenceMode("passive");
      heartbeatInFlight.current = false;
      setHasLivePresence(false);
      setPresenceStatus("Passive mode enabled — you can browse anonymously.");
      emitProximityMetric({ event: "mode_toggle", mode: "passive" });
      void sendOffline(currentUserId, currentCampusId);
    },
    [currentCampusId, currentUserId, enterLiveMode],
  );

  // ----- Snapshots (initial + when deps change) -----
  const fetchSnapshots = useCallback(async () => {
    // Avoid spamming the backend with 400s before a successful heartbeat
    if (!hasLivePresence) {
      // Mark all radius buckets as loaded with zero to keep UI stable
      setRadiusMeta((prev) => {
        const next: Record<number, RadiusMeta> = { ...prev };
        const now = Date.now();
        RADIUS_OPTIONS.forEach((option) => {
          next[option] = { count: 0, loading: false, lastUpdated: now };
        });
        return next;
      });
      setRadiusErrors((prev) => {
        const next = { ...prev };
        RADIUS_OPTIONS.forEach((option) => (next[option] = null));
        return next;
      });
      setUsersByRadius((prev) => {
        const next = { ...prev };
        RADIUS_OPTIONS.forEach((option) => (next[option] = []));
        return next;
      });
      return;
    }
    setRadiusMeta((prev) => {
      const next: Record<number, RadiusMeta> = { ...prev };
      RADIUS_OPTIONS.forEach((option) => {
        next[option] = { ...(next[option] ?? { count: null, loading: true }), loading: true };
      });
      return next;
    });

    const results: Record<number, NearbyUser[]> = {};
    const errors: Record<number, string | null> = {};
    let rateLimitHit = false;

    await Promise.all(
      RADIUS_OPTIONS.map(async (option) => {
        try {
          const items = await fetchNearbyWithRetry(currentUserId, currentCampusId, option);
          results[option] = items;
          errors[option] = null;
        } catch (err) {
          if (err instanceof Error && (err as { code?: string }).code === "RATE_LIMIT") {
            rateLimitHit = true;
            errors[option] = "Cooling down after too many quick requests.";
          } else {
            errors[option] = err instanceof Error ? err.message : "Unable to load nearby";
          }
          results[option] = [];
        }
      }),
    );

    setUsersByRadius((prev) => {
      const next = { ...prev };
      RADIUS_OPTIONS.forEach((option) => {
        next[option] = results[option] ?? [];
      });
      return next;
    });

    setRadiusMeta((prev) => {
      const next = { ...prev };
      const now = Date.now();
      RADIUS_OPTIONS.forEach((option) => {
        next[option] = {
          count: results[option]?.length ?? 0,
          loading: false,
          lastUpdated: now,
        };
      });
      return next;
    });

    setRadiusErrors((prev) => {
      const next = { ...prev };
      RADIUS_OPTIONS.forEach((option) => {
        next[option] = errors[option] ?? null;
      });
      return next;
    });
    if (rateLimitHit) {
      startRadiusCooldown();
    }
    const aggregatedError = rateLimitHit
      ? "You're checking nearby too quickly. Please wait a few seconds before trying again."
      : errors[radius] ?? null;
    setError(aggregatedError);
  }, [currentCampusId, currentUserId, radius, startRadiusCooldown, hasLivePresence]);

  useEffect(() => {
    let cancelled = false;
    fetchSnapshots().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Unable to load nearby");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSnapshots]);

  // ----- Activities (pulse) -----
  useEffect(() => {
    let cancelled = false;
    if (!hasLivePresence) {
      setActivities([]);
      setActivitiesError(null);
      setActivitiesLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setActivitiesLoading(true);
    fetchNearbyActivities(currentUserId, currentCampusId, radius)
      .then((items) => {
        if (!cancelled) {
          setActivities(items);
          setActivitiesError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setActivities([]);
          setActivitiesError(err instanceof Error ? err.message : "No nearby activity data yet");
        }
      })
      .finally(() => {
        if (!cancelled) setActivitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, currentCampusId, radius, hasLivePresence]);

  // ----- Render -----
  const currentUsers = usersByRadius[radius] ?? [];
  const currentMeta = radiusMeta[radius] ?? { count: null, loading: true };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Campus Proximity</h1>
          <p className="text-gray-600">
            {isDemoMode ? "Demo mode - explore the interface" : "Discover classmates nearby"}
          </p>
        </div>

        {/* Status Messages */}
        {!isOnline && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">You&apos;re offline. Some features may not be available.</p>
          </div>
        )}

        {locationNotice && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800">{locationNotice}</p>
          </div>
        )}

        {presenceStatus && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{presenceStatus}</p>
          </div>
        )}

        {trustHint && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start justify-between gap-4">
            <p className="text-emerald-800 text-sm">{trustHint}</p>
            <button
              type="button"
              onClick={handleDismissTrustHint}
              className="text-xs font-semibold text-emerald-700 underline underline-offset-2"
            >
              Got it
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {inviteMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{inviteMessage}</p>
          </div>
        )}

        {inviteError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{inviteError}</p>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Controls */}
          <div className="space-y-6">
            <LiveModeToggle
              mode={presenceMode}
              onToggle={handleModeToggle}
              ghostModeEnabled={ghostModeEnabled}
              trustScore={trustScore}
              onExplainTrust={handleExplainTrust}
            />

            <RadiusPanel
              radiusOptions={Array.from(RADIUS_OPTIONS)}
              activeRadius={radius}
              meta={radiusMeta}
              onRadiusChange={handleRadiusChange}
              suggestion={radiusSuggestion}
              onSuggestionClick={handleSuggestionClick}
              accuracyMeters={accuracyM}
              confidencePercent={confidencePercent}
              live={presenceMode === "live"}
              cooldownActive={isRadiusCoolingDown}
              cooldownMessage={radiusCooldownMessage ?? undefined}
            />

            <ActivityPreview
              activities={activities}
              loading={activitiesLoading}
              error={activitiesError}
              onLaunch={handleLaunchActivity}
            />
          </div>

          {/* Center Column - Nearby List */}
          <div className="lg:col-span-1">
            <NearbyList
              users={currentUsers}
              loading={currentMeta.loading}
              error={currentListError}
              invitePendingId={invitePendingId}
              onInvite={handleInvite}
              onSelect={handleSelectUser}
              selectedUserId={selectedUserId}
              selectedTemplate={selectedTemplate}
            />
          </div>

          {/* Right Column - Map & Templates */}
          <div className="space-y-6">
            <MiniMap
              users={currentUsers}
              radius={radius}
              selectedUserId={selectedUserId}
              onSelect={handleSelectUser}
            />

            <InviteTemplates
              templates={QUICK_INVITE_TEMPLATES}
              onSelect={(template) => setSelectedTemplate(template)}
              selected={selectedTemplate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
