"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

declare const process: { env?: Record<string, string | undefined> } | undefined;

import { apiFetch } from "@/app/lib/http/client";
import { AuthError } from "@/app/lib/http/errors";
import { FLAGS, type FlagKey } from "./keys";

const FLAG_TTL_MS = 30_000;

type Primitive = string | number | boolean | null | undefined;

type FlagEntry = {
  value: Primitive;
  variant?: string;
};

type FlagDictionary = Record<string, FlagEntry>;

const DEFAULT_FLAGS: FlagDictionary = {
  [FLAGS.MOD_UI]: { value: false },
  [FLAGS.SAFETY_UI]: { value: false },
  [FLAGS.MEDIA_V2]: { value: false },
  [FLAGS.UX_METRICS]: { value: true },
  [FLAGS.BLUR_SENSITIVE]: { value: true },
};

const ENV_FLAG_KEYS: Record<string, FlagKey> = {
  NEXT_PUBLIC_FLAG_UI_MOD: FLAGS.MOD_UI,
  NEXT_PUBLIC_FLAG_UI_SAFETY: FLAGS.SAFETY_UI,
  NEXT_PUBLIC_FLAG_UI_MEDIA_V2: FLAGS.MEDIA_V2,
  NEXT_PUBLIC_FLAG_UI_METRICS: FLAGS.UX_METRICS,
  NEXT_PUBLIC_FLAG_UI_BLUR_SENSITIVE: FLAGS.BLUR_SENSITIVE,
};

let cachedFlags: FlagDictionary | null = null;
let lastFetch = 0;
let inflight: Promise<FlagDictionary | null> | null = null;

function normalisePrimitive(value: unknown): Primitive {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return normalisePrimitive((value as { value: unknown }).value);
  }
  return undefined;
}

function normaliseVariant(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null && "variant" in value) {
    const variant = (value as { variant?: unknown }).variant;
    return typeof variant === "string" ? variant : undefined;
  }
  return undefined;
}

function toEntry(value: unknown): FlagEntry {
  const primitive = normalisePrimitive(value);
  const variant = normaliseVariant(value);
  return {
    value: primitive,
    variant,
  };
}

function mergeFlags(base: FlagDictionary, override: FlagDictionary): FlagDictionary {
  const next: FlagDictionary = { ...base };
  for (const [key, entry] of Object.entries(override)) {
    next[key] = entry;
  }
  return next;
}

function coerceToBoolean(value: Primitive): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value !== 0 : false;
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (!lowered) {
      return false;
    }
    return !["0", "false", "off", "disabled", "no"].includes(lowered);
  }
  return false;
}

function readEnvFlags(): FlagDictionary {
  // NOTE: These must be direct `process.env.NEXT_PUBLIC_*` reads so Next can inline them.
  const entries: FlagDictionary = {};

  const mod = process?.env?.NEXT_PUBLIC_FLAG_UI_MOD;
  if (mod !== undefined) entries[ENV_FLAG_KEYS.NEXT_PUBLIC_FLAG_UI_MOD] = toEntry(mod);

  const safety = process?.env?.NEXT_PUBLIC_FLAG_UI_SAFETY;
  if (safety !== undefined) entries[ENV_FLAG_KEYS.NEXT_PUBLIC_FLAG_UI_SAFETY] = toEntry(safety);

  const mediaV2 = process?.env?.NEXT_PUBLIC_FLAG_UI_MEDIA_V2;
  if (mediaV2 !== undefined) entries[ENV_FLAG_KEYS.NEXT_PUBLIC_FLAG_UI_MEDIA_V2] = toEntry(mediaV2);

  const metrics = process?.env?.NEXT_PUBLIC_FLAG_UI_METRICS;
  if (metrics !== undefined) entries[ENV_FLAG_KEYS.NEXT_PUBLIC_FLAG_UI_METRICS] = toEntry(metrics);

  const blur = process?.env?.NEXT_PUBLIC_FLAG_UI_BLUR_SENSITIVE;
  if (blur !== undefined) entries[ENV_FLAG_KEYS.NEXT_PUBLIC_FLAG_UI_BLUR_SENSITIVE] = toEntry(blur);

  return entries;
}

function readWindowFlags(): FlagDictionary {
  if (typeof window === "undefined") {
    return {};
  }
  const bootstrap = window.__BOOT_FLAGS__ ?? {};
  const entries: FlagDictionary = {};
  if (bootstrap && typeof bootstrap === "object") {
    for (const [key, value] of Object.entries(bootstrap)) {
      entries[key] = toEntry(value);
    }
  }
  return entries;
}

type FlagsResponse = Record<string, unknown> | { flags?: Record<string, unknown> };

async function fetchRemoteFlags(force = false): Promise<FlagDictionary | null> {
  const now = Date.now();
  if (!force && (now - lastFetch < FLAG_TTL_MS || inflight)) {
    if (inflight) {
      return inflight;
    }
    return cachedFlags;
  }

  const request = (async () => {
    try {
      const response = await apiFetch<FlagsResponse>("/flags/evaluate", {
        cache: "no-store",
      });
      const payload = (response && typeof response === "object" && "flags" in response
        ? (response as { flags?: Record<string, unknown> }).flags
        : response) as Record<string, unknown> | undefined;
      if (!payload) {
        lastFetch = now;
        return null;
      }
      const remote: FlagDictionary = {};
      for (const [key, value] of Object.entries(payload)) {
        remote[key] = toEntry(value);
      }
      lastFetch = now;
      return remote;
    } catch (error) {
      lastFetch = now;
      // Silently ignore AuthError on public pages - user is not logged in
      if (error instanceof AuthError) {
        return null;
      }
      console.warn("Failed to fetch remote flags", error);
      return null;
    } finally {
      inflight = null;
    }
  })();

  inflight = request;
  return request;
}

function ensureBootstrap() {
  if (cachedFlags) {
    return;
  }
  const base: FlagDictionary = { ...DEFAULT_FLAGS };
  const envFlags = readEnvFlags();
  const windowFlags = readWindowFlags();
  cachedFlags = mergeFlags(base, mergeFlags(envFlags, windowFlags));
}

export interface UseFlagsResult {
  ready: boolean;
  values: Record<string, Primitive>;
  has: (key: string) => boolean;
  variant: (key: string) => string | undefined;
  reload: () => Promise<void>;
}

export function useFlags(): UseFlagsResult {
  ensureBootstrap();
  const [flags, setFlags] = useState<FlagDictionary>(() => cachedFlags ?? {});
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchRemoteFlags();
      if (cancelled) {
        return;
      }
      if (remote) {
        cachedFlags = mergeFlags(cachedFlags ?? {}, remote);
        setFlags((prev) => mergeFlags(prev, remote));
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const values = useMemo(() => {
    const record: Record<string, Primitive> = {};
    for (const [key, entry] of Object.entries(flags)) {
      record[key] = entry.value;
    }
    return record;
  }, [flags]);

  const has = useCallback(
    (key: string) => {
      const entry = flags[key];
      if (!entry) {
        return false;
      }
      return coerceToBoolean(entry.value);
    },
    [flags],
  );

  const variant = useCallback(
    (key: string) => {
      const entry = flags[key];
      return entry?.variant;
    },
    [flags],
  );

  const reload = useCallback(async () => {
    const remote = await fetchRemoteFlags(true);
    if (!remote) {
      return;
    }
    cachedFlags = mergeFlags(cachedFlags ?? {}, remote);
    setFlags((prev) => mergeFlags(prev, remote));
  }, []);

  return {
    ready,
    values,
    has,
    variant,
    reload,
  };
}
