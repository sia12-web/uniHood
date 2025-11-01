const AUTH_STORAGE_KEY = "divan.auth";
const AUTH_EVENT = "divan:auth-changed";

export type AuthSnapshot = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: string;
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

function parseSyntheticToken(token: string): TokenParts {
  return token.split(";").reduce<TokenParts>((acc, fragment) => {
    if (!fragment || !fragment.includes(":")) {
      return acc;
    }
    const [key, value] = fragment.split(":", 2);
    if (key && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function snapshotToAuthUser(snapshot: AuthSnapshot | null): AuthUser | null {
  if (!snapshot?.access_token) {
    return null;
  }
  const parts = parseSyntheticToken(snapshot.access_token);
  const userId = parts.uid ?? (snapshot.user_id ?? null);
  if (!userId) {
    return null;
  }
  return {
    userId,
    campusId: parts.campus ?? null,
    handle: parts.handle ?? undefined,
    displayName: parts.name ?? undefined,
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
