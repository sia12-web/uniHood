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
  const payload: RefreshPayload = {};
  if (sessionId) {
    payload.session_id = sessionId;
  }
  const deviceLabel = (current as Record<string, unknown>).device_label;
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
        clearAuthSnapshot();
        return null;
      }
      let data: RefreshResponse;
      try {
        data = (await response.json()) as RefreshResponse;
      } catch {
        clearAuthSnapshot();
        return null;
      }
      if (!data.access_token || typeof data.access_token !== "string") {
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
    } catch {
      clearAuthSnapshot();
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
