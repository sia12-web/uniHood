// Declare process shape to appease TypeScript without requiring @types/node.
declare const process: { env?: Record<string, string | undefined> } | undefined;

// Prefer direct env constants so Next.js can inline them in client bundles.
const PUBLIC_BACKEND_URL: string | undefined = (typeof process !== "undefined" && process.env)
  ? process.env.NEXT_PUBLIC_BACKEND_URL
  : undefined;
const SERVER_BACKEND_URL: string | undefined = (typeof process !== "undefined" && process.env)
  ? process.env.NEXT_SERVER_BACKEND_URL
  : undefined;

type EnvRecord = Record<string, string | undefined>;

function readEnv(): EnvRecord {
  if (typeof process !== "undefined" && process?.env) {
    return process.env;
  }
  if (typeof globalThis !== "undefined") {
    const globalProcess = (globalThis as { process?: { env?: EnvRecord } }).process;
    if (globalProcess?.env) {
      return globalProcess.env;
    }
  }
  return {};
}

const env = readEnv();

function readOptionalEnv(key: string): string | null {
  const value = env[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getBackendUrl() {
  const isServer = typeof window === "undefined";
  const explicit = (isServer ? (SERVER_BACKEND_URL ?? PUBLIC_BACKEND_URL) : PUBLIC_BACKEND_URL) ?? "";
  const trimmed = explicit.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return "http://localhost:8000";
}

export function getDemoUserId() {
  return env.NEXT_PUBLIC_DEMO_USER_ID ?? "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
}

export function getDemoCampusId() {
  return env.NEXT_PUBLIC_DEMO_CAMPUS_ID ?? "33333333-3333-3333-3333-333333333333";
}

function parseCoordinate(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDemoLatitude() {
  return parseCoordinate(env.NEXT_PUBLIC_DEMO_LAT, 37.7749);
}

export function getDemoLongitude() {
  return parseCoordinate(env.NEXT_PUBLIC_DEMO_LON, -122.4194);
}

export function getDemoUserEmail() {
  return env.NEXT_PUBLIC_DEMO_USER_EMAIL ?? "user@example.com";
}

export function getDemoUserCampus(): string | null {
  const raw = env.NEXT_PUBLIC_DEMO_USER_CAMPUS ?? env.NEXT_PUBLIC_DEMO_CAMPUS_ID ?? "";
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDemoHandle(): string | null {
  return readOptionalEnv("NEXT_PUBLIC_DEMO_HANDLE");
}

export function getDemoChatPeerId(): string | null {
  return readOptionalEnv("NEXT_PUBLIC_DEMO_CHAT_PEER_ID");
}

function activityKey(kind: string): string {
  return `NEXT_PUBLIC_DEMO_${kind.toUpperCase()}_ID`;
}

export function getDemoActivityId(kind: "rps" | "story" | "trivia" | "typing" | "with"): string | null {
  return readOptionalEnv(activityKey(kind));
}

/**
 * Whether to route API calls through the Next.js dev server via rewrites, avoiding CORS in development.
 * Defaults to true in development unless explicitly disabled via NEXT_PUBLIC_DEV_API_PROXY=0.
 */
export function isDevApiProxyEnabled(): boolean {
  const raw = env.NEXT_PUBLIC_DEV_API_PROXY ?? env.NEXT_DEV_API_PROXY;
  const val = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (val === "0" || val === "false" || val === "no" || val === "off") {
    return false;
  }
  if (val === "1" || val === "true" || val === "yes" || val === "on") {
    return true;
  }
  // Default: enabled in development
  const nodeEnv = (typeof process !== "undefined" && (process as unknown as { env?: Record<string, string | undefined> })?.env?.NODE_ENV) || "development";
  return nodeEnv !== "production";
}

// Returns the explicitly configured backend URL from env, without any client-side
// safety fallbacks. Useful for diagnostics or targeted retries when the resolved
// URL appears to be same-origin and serving HTML.
export function getExplicitBackendUrl(): string | null {
  const isServer = typeof window === "undefined";
  const raw = isServer ? (SERVER_BACKEND_URL ?? PUBLIC_BACKEND_URL) : PUBLIC_BACKEND_URL;
  const explicit = typeof raw === "string" ? raw.trim() : "";
  return explicit.length > 0 ? explicit : null;
}