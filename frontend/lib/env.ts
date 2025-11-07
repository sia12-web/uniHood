// Declare process shape to appease TypeScript without requiring @types/node.
declare const process: { env?: Record<string, string | undefined> } | undefined;

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
  return env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
}

export function getDemoUserId() {
  return env.NEXT_PUBLIC_DEMO_USER_ID ?? "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
}

export function getDemoCampusId() {
  return env.NEXT_PUBLIC_DEMO_CAMPUS_ID ?? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
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