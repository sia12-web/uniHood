import { getBackendUrl, getDemoCampusId, getDemoLatitude, getDemoLongitude, getDemoUserId } from "@/lib/env";
import { canSendHeartbeat, clampHeartbeatAccuracy } from "@/lib/geo";

const BACKEND_URL = getBackendUrl();
const DEMO_CAMPUS_ID = getDemoCampusId();
const DEMO_USER_ID = getDemoUserId();
const DEMO_LAT = getDemoLatitude();
const DEMO_LON = getDemoLongitude();

export const LOCATION_PERMISSION_MESSAGE =
  "Location permission needed to go live. Please allow location access in your browser.";

export function getDemoIdentifiers(): { userId: string; campusId: string } {
  return {
    userId: DEMO_USER_ID,
    campusId: DEMO_CAMPUS_ID,
  };
}

export function createFallbackPosition(): GeolocationPosition {
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

export function requestBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new Error(LOCATION_PERMISSION_MESSAGE));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(position);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error(LOCATION_PERMISSION_MESSAGE));
          return;
        }
        reject(new Error(error.message || "Unable to determine your location"));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}

export async function sendHeartbeat(
  position: GeolocationPosition,
  userId: string,
  campusId: string,
  radius: number,
): Promise<void> {
  const rawAccuracy = position.coords.accuracy ?? Number.POSITIVE_INFINITY;
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

  // Record last successful heartbeat time for lightweight UI indicators
  try {
    if (typeof window !== "undefined" && "localStorage" in window) {
      window.localStorage.setItem("divan:lastHeartbeatAt", String(Date.now()));
    }
  } catch {
    // best-effort; ignore storage errors
  }
}

export async function sendOffline(userId: string, campusId: string): Promise<void> {
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

export function getLastHeartbeatAt(): number | null {
  try {
    if (typeof window === "undefined" || !("localStorage" in window)) return null;
    const raw = window.localStorage.getItem("divan:lastHeartbeatAt");
    const ts = raw ? Number(raw) : NaN;
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

export function isRecentlyLive(windowMs = 10_800_000): boolean {  // 3 hours
  const ts = getLastHeartbeatAt();
  if (!ts) return false;
  return Date.now() - ts <= windowMs;
}
