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
  // Allow disabling the implicit demo user fallback so that components
  // requiring an authenticated user do not silently default to the placeholder.
  if ((env.DISABLE_DEMO_USER ?? '').trim() === '1') {
    return '';
  }
  return env.NEXT_PUBLIC_DEMO_USER_ID ?? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
}

export function getDemoCampusId() {
  // Only McGill is available in the demo environment for now.
  return env.NEXT_PUBLIC_DEMO_CAMPUS_ID ?? "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2";
}

function parseCoordinate(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDemoLatitude() {
  return parseCoordinate(env.NEXT_PUBLIC_DEMO_LAT, 45.5048);
}

export function getDemoLongitude() {
  return parseCoordinate(env.NEXT_PUBLIC_DEMO_LON, -73.5772);
}

export function getDemoUserEmail() {
  return env.NEXT_PUBLIC_DEMO_USER_EMAIL ?? "student@mcgill.ca";
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
