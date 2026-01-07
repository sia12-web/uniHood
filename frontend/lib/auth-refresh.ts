import { readAuthSnapshot, storeAuthSnapshot, clearAuthSnapshot, type AuthSnapshot } from "./auth-storage";
import { getBackendUrl } from "./env";

const BASE_URL = getBackendUrl();

let inFlightRefresh: Promise<AuthSnapshot | null> | null = null;

type RefreshResponse = {
  access_token: string;
  session_id?: string;
  expires_in?: number;
  token_type?: string;
  user_id?: string;
  [key: string]: unknown;
};

type RefreshPayload = {
  // Allow optional session_id so refresh can rely on HTTP-only cookie when present.
  session_id?: string;
  device_label?: string;
};

function extractSessionId(snapshot: AuthSnapshot | null): string | null {
  if (!snapshot) {
    return null;
  }
  const extras = snapshot as Record<string, unknown>;
  const direct = typeof extras.session_id === "string" ? (extras.session_id as string) : null;
  if (direct && direct.trim().length > 0) {
    return direct;
  }
  const camel = typeof extras.sessionId === "string" ? (extras.sessionId as string) : null;
  if (camel && camel.trim().length > 0) {
    return camel;
  }
  const snake = typeof extras.session === "string" ? (extras.session as string) : null;
  if (snake && snake.trim().length > 0) {
    return snake;
  }
  return null;
}

export async function refreshAccessToken(): Promise<AuthSnapshot | null> {
  if (typeof window === "undefined") {
    return null;
  }
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  const current = readAuthSnapshot();
  const sessionId = extractSessionId(current);
  if (!sessionId) {
    clearAuthSnapshot();
    return null;
  }
  const payload: RefreshPayload = {};
  payload.session_id = sessionId;
  const deviceLabel = current ? (current as Record<string, unknown>).device_label : undefined;
  if (typeof deviceLabel === "string" && deviceLabel.trim().length > 0) {
    payload.device_label = deviceLabel;
  }

  inFlightRefresh = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Only clear snapshot on 4xx client errors (invalid token, expired session, etc.)
        // Preserve it on 5xx or network errors so we don't kick the user out due to temporary glitches.
        if (response.status >= 400 && response.status < 500) {
          console.warn("[auth-refresh] Refresh failed with 4xx, clearing session", response.status);
          clearAuthSnapshot();
        } else {
          console.error("[auth-refresh] Refresh failed with server/network error", response.status);
        }
        return null;
      }

      let data: RefreshResponse;
      try {
        data = (await response.json()) as RefreshResponse;
      } catch (err) {
        console.error("[auth-refresh] Failed to parse refresh response", err);
        // Don't clear here, might be a temporary parsing/network issue if response was ok but body garbled
        return null;
      }

      if (!data.access_token || typeof data.access_token !== "string") {
        console.warn("[auth-refresh] Refresh response missing access token");
        clearAuthSnapshot();
        return null;
      }

      const nextSnapshot: AuthSnapshot = {
        ...(current ?? {}),
        ...data,
        stored_at: new Date().toISOString(),
      };
      storeAuthSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (err) {
      console.error("[auth-refresh] Network error during refresh", err);
      // DO NOT clearAuthSnapshot() here! It might be a temporary dropout.
      // If we clear, the user is immediately kicked out to login.
      // By returning null, the caller (apiFetch) will treat it as a failed refresh
      // but the original credentials remain in storage for a retry.
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
