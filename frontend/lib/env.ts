// Declare process shape to appease TypeScript without requiring @types/node.
//
// IMPORTANT: For Next.js, `process.env.NEXT_PUBLIC_*` references are replaced at build time.
// Avoid dynamic env lookups (e.g. `process.env[key]`) because they will not be inlined into
// client bundles and can cause production builds to fall back to localhost.
declare const process: { env: Record<string, string | undefined> };

function readOptionalEnv(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getBackendUrl() {
  const value = readOptionalEnv(process.env.NEXT_PUBLIC_BACKEND_URL);
  return value ?? "http://127.0.0.1:8001";
}

export function getDemoUserId() {
  const disableDemo =
    (readOptionalEnv(process.env.NEXT_PUBLIC_DISABLE_DEMO_USER) ??
      readOptionalEnv(process.env.DISABLE_DEMO_USER) ??
      "").trim() === "1";
  if (disableDemo) {
    return '';
  }
  return process.env.NEXT_PUBLIC_DEMO_USER_ID ?? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
}

export function getDemoCampusId() {
  return process.env.NEXT_PUBLIC_DEMO_CAMPUS_ID ?? "33333333-3333-3333-3333-333333333333";
}

function parseCoordinate(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDemoLatitude() {
  return parseCoordinate(process.env.NEXT_PUBLIC_DEMO_LAT, 45.5048);
}

export function getDemoLongitude() {
  return parseCoordinate(process.env.NEXT_PUBLIC_DEMO_LON, -73.5772);
}

export function getDemoUserEmail() {
  return process.env.NEXT_PUBLIC_DEMO_USER_EMAIL ?? "unihoodapp@gmail.com";
}

export function getDemoUserCampus(): string | null {
  const raw = process.env.NEXT_PUBLIC_DEMO_USER_CAMPUS ?? process.env.NEXT_PUBLIC_DEMO_CAMPUS_ID ?? "";
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDemoHandle(): string | null {
  return readOptionalEnv(process.env.NEXT_PUBLIC_DEMO_HANDLE);
}

export function getDemoChatPeerId(): string | null {
  return readOptionalEnv(process.env.NEXT_PUBLIC_DEMO_CHAT_PEER_ID);
}

export function getDemoActivityId(kind: "rps" | "story" | "trivia" | "typing" | "with"): string | null {
  if (kind === "rps") return readOptionalEnv(process.env.NEXT_PUBLIC_DEMO_RPS_ID);
  if (kind === "story") return readOptionalEnv(process.env.NEXT_PUBLIC_DEMO_STORY_ID);
  if (kind === "trivia") return readOptionalEnv(process.env.NEXT_PUBLIC_DEMO_TRIVIA_ID);
  if (kind === "typing") return readOptionalEnv(process.env.NEXT_PUBLIC_DEMO_TYPING_ID);
  if (kind === "with") return readOptionalEnv(process.env.NEXT_PUBLIC_DEMO_WITH_ID);
  return null;
}
