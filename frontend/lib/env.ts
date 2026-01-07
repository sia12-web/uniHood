/**
 * Environment variable accessor for uniHood.
 *
 * NOTE: For Next.js, `process.env.NEXT_PUBLIC_*` references are statically replaced at build time.
 * We must use the full literal access (e.g., process.env.NEXT_PUBLIC_VAR) for the replacement to work.
 * We wrap these in try-catch to avoid runtime crashes if the bundler fails to perform the replacement.
 */

function readEnv(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getBackendUrl(): string {
  try {
    const value = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (value) return value;
  } catch {
    // process is not defined
  }
  return "";
}

export function getDemoUserId(): string {
  try {
    const disableDemo = process.env.NEXT_PUBLIC_DISABLE_DEMO_USER === "1";
    if (disableDemo) return "";

    const demoId = process.env.NEXT_PUBLIC_DEMO_USER_ID;
    if (demoId) return demoId;
  } catch {
    // ignore
  }
  return "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
}

export function getDemoCampusId(): string {
  try {
    const cid = process.env.NEXT_PUBLIC_DEMO_CAMPUS_ID;
    if (cid) return cid;
  } catch {
    // ignore
  }
  return "33333333-3333-3333-3333-333333333333";
}

function parseCoordinate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDemoLatitude(): number {
  try {
    return parseCoordinate(process.env.NEXT_PUBLIC_DEMO_LAT, 45.5048);
  } catch {
    return 45.5048;
  }
}

export function getDemoLongitude(): number {
  try {
    return parseCoordinate(process.env.NEXT_PUBLIC_DEMO_LON, -73.5772);
  } catch {
    return -73.5772;
  }
}

export function getDemoUserEmail(): string {
  try {
    const email = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL;
    if (email) return email;
  } catch {
    // ignore
  }
  return "unihoodapp@gmail.com";
}

export function getDemoUserCampus(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_DEMO_USER_CAMPUS ?? process.env.NEXT_PUBLIC_DEMO_CAMPUS_ID;
    return readEnv(raw);
  } catch {
    return null;
  }
}

export function getDemoHandle(): string | null {
  try {
    return readEnv(process.env.NEXT_PUBLIC_DEMO_HANDLE);
  } catch {
    return null;
  }
}

export function getDemoChatPeerId(): string | null {
  try {
    return readEnv(process.env.NEXT_PUBLIC_DEMO_CHAT_PEER_ID);
  } catch {
    return null;
  }
}

export function getDemoActivityId(kind: "rps" | "story" | "trivia" | "typing" | "with"): string | null {
  try {
    if (kind === "rps") return readEnv(process.env.NEXT_PUBLIC_DEMO_RPS_ID);
    if (kind === "story") return readEnv(process.env.NEXT_PUBLIC_DEMO_STORY_ID);
    if (kind === "trivia") return readEnv(process.env.NEXT_PUBLIC_DEMO_TRIVIA_ID);
    if (kind === "typing") return readEnv(process.env.NEXT_PUBLIC_DEMO_TYPING_ID);
    if (kind === "with") return readEnv(process.env.NEXT_PUBLIC_DEMO_WITH_ID);
  } catch {
    // ignore
  }
  return null;
}
