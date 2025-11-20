const AUTH_STORAGE_KEY = "divan.auth";
const AUTH_EVENT = "divan:auth-changed";

export type AuthSnapshot = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: string;
  session_id?: string;
  sessionId?: string;
  device_label?: string;
  campus_id?: string;
  stored_at?: string;
  [key: string]: unknown;
};

export type AuthUser = {
  userId: string;
  campusId: string | null;
  handle?: string;
  displayName?: string;
};

type TokenParts = {
  uid?: string;
  campus?: string;
  handle?: string;
  name?: string;
  [key: string]: string | undefined;
};

type JwtClaims = Record<string, unknown>;

function decodeBase64Url(segment: string): string | null {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const base64 = `${normalized}${padding}`;
  try {
    if (typeof atob === "function") {
      return atob(base64);
    }
  } catch {
    return null;
  }
  try {
    if (typeof globalThis !== "undefined") {
      const scopes = globalThis as {
        atob?: (data: string) => string;
        Buffer?: { from: (data: string, encoding: string) => { toString: (encoding: string) => string } };
      };
      if (scopes.Buffer && typeof scopes.Buffer.from === "function") {
        return scopes.Buffer.from(base64, "base64").toString("utf-8");
      }
      if (scopes.atob && typeof scopes.atob === "function") {
        const binary = scopes.atob(base64);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        if (typeof TextDecoder !== "undefined") {
          return new TextDecoder().decode(bytes);
        }
        return String.fromCharCode(...bytes);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function decodeJwtClaims(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const payload = parts[1];
  try {
    const decoded = decodeBase64Url(payload);
    if (!decoded) {
      return null;
    }
    return JSON.parse(decoded) as JwtClaims;
  } catch {
    return null;
  }
}

function parseSyntheticToken(token: string): TokenParts {
  return token.split(";").reduce<TokenParts>((acc, fragment) => {
    const chunk = fragment.trim();
    if (!chunk || !chunk.includes(":")) {
      return acc;
    }
    const [rawKey, rawValue] = chunk.split(":", 2);
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue?.trim();
    if (key && value) {
      (acc as Record<string, string>)[key] = value;
    }
    return acc;
  }, {});
}

function snapshotToAuthUser(snapshot: AuthSnapshot | null): AuthUser | null {
  if (!snapshot?.access_token) {
    return null;
  }
  const parts = parseSyntheticToken(snapshot.access_token);
  const jwtClaims = isLikelyJwtToken(snapshot.access_token) ? decodeJwtClaims(snapshot.access_token) : null;
  const claims = jwtClaims ?? {};
  const extras = snapshot as Record<string, unknown>;
  const userId =
    (typeof claims.sub === "string" ? (claims.sub as string) : undefined) ??
    (typeof claims.uid === "string" ? (claims.uid as string) : undefined) ??
    parts.uid ??
    (snapshot.user_id ?? null);
  if (!userId) {
    return null;
  }
  return {
    userId,
    campusId:
      (typeof claims.campus_id === "string" ? (claims.campus_id as string) : undefined) ??
      (typeof claims.campus === "string" ? (claims.campus as string) : undefined) ??
      parts.campus ??
      null,
    handle:
      (typeof claims.handle === "string" ? (claims.handle as string) : undefined) ??
      (typeof claims.preferred_username === "string"
        ? (claims.preferred_username as string)
        : undefined) ??
      parts.handle ??
      (typeof extras.handle === "string" ? (extras.handle as string) : undefined),
    displayName:
      (typeof claims.name === "string" ? (claims.name as string) : undefined) ??
      (typeof claims.display_name === "string" ? (claims.display_name as string) : undefined) ??
      parts.name ??
      (typeof extras.display_name === "string" ? (extras.display_name as string) : undefined),
  };
}

export function readAuthSnapshot(): AuthSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSnapshot) : null;
  } catch {
    return null;
  }
}

export function readAuthUser(): AuthUser | null {
  return snapshotToAuthUser(readAuthSnapshot());
}

function emitAuthEvent(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function storeAuthSnapshot(snapshot: AuthSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot));
  emitAuthEvent();
}

export function clearAuthSnapshot(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  emitAuthEvent();
}

export function onAuthChange(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const handler = () => callback();
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export { AUTH_STORAGE_KEY, AUTH_EVENT };

function isLikelyJwtToken(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }
  const parts = token.split(".");
  return parts.length === 3 && parts.every((segment) => segment.length > 0);
}

export function resolveAuthHeaders(snapshot: AuthSnapshot | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!snapshot?.access_token) {
    return headers;
  }
  const token = snapshot.access_token.trim();
  if (!token) {
    return headers;
  }

  if (isLikelyJwtToken(token)) {
    headers.Authorization = `Bearer ${token}`;
  }

  const parsed = parseSyntheticToken(token);
  const extras = snapshot as Record<string, unknown>;
  const claims = isLikelyJwtToken(token) ? decodeJwtClaims(token) : null;

  const userId =
    (claims && typeof claims.sub === "string" ? (claims.sub as string) : undefined) ??
    (claims && typeof claims.uid === "string" ? (claims.uid as string) : undefined) ??
    parsed.uid ??
    parsed.user_id ??
    (typeof snapshot.user_id === "string" ? snapshot.user_id : undefined) ??
    (typeof extras.userId === "string" ? (extras.userId as string) : undefined);
  if (userId) {
    headers["X-User-Id"] = userId;
  }

  const campusId =
    (claims && typeof claims.campus_id === "string" ? (claims.campus_id as string) : undefined) ??
    (claims && typeof claims.campus === "string" ? (claims.campus as string) : undefined) ??
    parsed.campus ??
    parsed.campus_id ??
    (typeof extras.campus_id === "string" ? (extras.campus_id as string) : undefined) ??
    (typeof extras.campusId === "string" ? (extras.campusId as string) : undefined);
  if (campusId) {
    headers["X-Campus-Id"] = campusId;
  }

  const sessionId =
    parsed.sid ??
    parsed.session ??
    parsed.session_id ??
    (claims && typeof claims.sid === "string" ? (claims.sid as string) : undefined) ??
    (claims && typeof claims.session_id === "string" ? (claims.session_id as string) : undefined);
  if (sessionId) {
    headers["X-Session-Id"] = sessionId;
  }

  const handle =
    (claims && typeof claims.handle === "string" ? (claims.handle as string) : undefined) ??
    (claims && typeof claims.preferred_username === "string"
      ? (claims.preferred_username as string)
      : undefined) ??
    parsed.handle ??
    (typeof extras.handle === "string" ? (extras.handle as string) : undefined) ??
    (typeof extras.user_handle === "string" ? (extras.user_handle as string) : undefined);
  if (handle) {
    headers["X-User-Handle"] = handle;
  }

  const displayName =
    (claims && typeof claims.name === "string" ? (claims.name as string) : undefined) ??
    (claims && typeof claims.display_name === "string" ? (claims.display_name as string) : undefined) ??
    parsed.name ??
    (typeof extras.display_name === "string" ? (extras.display_name as string) : undefined) ??
    (typeof extras.name === "string" ? (extras.name as string) : undefined);
  if (displayName) {
    headers["X-User-Name"] = displayName;
  }

  if (claims) {
    const rolesClaim = claims.roles ?? claims.role ?? claims.scp;
    let roles: string | null = null;
    if (Array.isArray(rolesClaim)) {
      roles = rolesClaim.map((value) => String(value).trim()).filter(Boolean).join(",");
    } else if (typeof rolesClaim === "string") {
      roles = rolesClaim;
    }
    if (roles && roles.trim().length > 0) {
      headers["X-User-Roles"] = roles;
    }
  }

  return headers;
}

export function isSyntheticAccessToken(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }
  return !isLikelyJwtToken(token) && token.includes(";");
}
