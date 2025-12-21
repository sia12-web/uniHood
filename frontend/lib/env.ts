// Declare process shape to appease TypeScript without requiring @types/node.
//
// IMPORTANT: For Next.js, `process.env.NEXT_PUBLIC_*` references are replaced at build time.
// Avoid dynamic env lookups (e.g. `process.env[key]`) because they will not be inlined into
// client bundles and can cause production builds to fall back to localhost.
declare const process: { env?: Record<string, string | undefined> } | undefined;

function readOptionalEnv(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }
  return process.env[key];
}

export function getBackendUrl() {
  const value = readOptionalEnv(safeEnv('NEXT_PUBLIC_BACKEND_URL'));
  return value ?? "http://localhost:8001";
}

export function getDemoUserId() {
  const disableDemo =
    (readOptionalEnv(safeEnv('NEXT_PUBLIC_DISABLE_DEMO_USER')) ??
      readOptionalEnv(safeEnv('DISABLE_DEMO_USER')) ??
      "").trim() === "1";
  if (disableDemo) {
    return '';
  }
  return safeEnv('NEXT_PUBLIC_DEMO_USER_ID') ?? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
}

export function getDemoCampusId() {
  return safeEnv('NEXT_PUBLIC_DEMO_CAMPUS_ID') ?? "33333333-3333-3333-3333-333333333333";
}

function parseCoordinate(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDemoLatitude() {
  return parseCoordinate(safeEnv('NEXT_PUBLIC_DEMO_LAT'), 45.5048);
}

export function getDemoLongitude() {
  return parseCoordinate(safeEnv('NEXT_PUBLIC_DEMO_LON'), -73.5772);
}

export function getDemoUserEmail() {
  return safeEnv('NEXT_PUBLIC_DEMO_USER_EMAIL') ?? "unihoodapp@gmail.com";
}

export function getDemoUserCampus(): string | null {
  const raw = safeEnv('NEXT_PUBLIC_DEMO_USER_CAMPUS') ?? safeEnv('NEXT_PUBLIC_DEMO_CAMPUS_ID') ?? "";
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDemoHandle(): string | null {
  return readOptionalEnv(safeEnv('NEXT_PUBLIC_DEMO_HANDLE'));
}

export function getDemoChatPeerId(): string | null {
  return readOptionalEnv(safeEnv('NEXT_PUBLIC_DEMO_CHAT_PEER_ID'));
}

export function getDemoActivityId(kind: "rps" | "story" | "trivia" | "typing" | "with"): string | null {
  const kindUpper = kind.toUpperCase();
  const key = `NEXT_PUBLIC_DEMO_${kindUpper}_ID`;
  return readOptionalEnv(safeEnv(key));
}
