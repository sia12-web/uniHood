import axios from 'axios';

// Backend base URL (FastAPI service). Falls back to same origin if env not set.
const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');

// Resolve activities-core base URL. Add explicit dev-time debug so we can see when env var is missing.
const DEFAULT_ACTIVITIES_CORE = 'http://localhost:3001';
const CORE_BASE_RAW = process.env.NEXT_PUBLIC_ACTIVITIES_CORE_URL || DEFAULT_ACTIVITIES_CORE;
const CORE_BASE = CORE_BASE_RAW.replace(/\/$/, '');
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.debug('[activities-core] resolved CORE_BASE =', CORE_BASE, '(raw:', CORE_BASE_RAW, ')');
  if (!process.env.NEXT_PUBLIC_ACTIVITIES_CORE_URL) {
    // eslint-disable-next-line no-console
    console.warn(
      `[activities-core] NEXT_PUBLIC_ACTIVITIES_CORE_URL not set. Using default ${DEFAULT_ACTIVITIES_CORE}. ` +
        'Start the activities-core dev server (npm run dev inside services/activities-core) or override the URL via frontend/.env.local.',
    );
  }
  if (CORE_BASE === '/api') {
    // eslint-disable-next-line no-console
    console.warn(
      '[activities-core] Using /api proxy. Ensure your Next.js dev server forwards /api to activities-core or set NEXT_PUBLIC_ACTIVITIES_CORE_URL=http://localhost:3001',
    );
  }
}

import { readAuthSnapshot, resolveAuthHeaders, readAuthUser } from '@/lib/auth-storage';
import { getDemoUserId } from '@/lib/env';

const api = axios.create({ baseURL: BACKEND || undefined });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.prototype.toString.call(value) === '[object Object]';
}

function headersToObject(input?: HeadersInit): Record<string, string> {
  if (!input) {
    return {};
  }
  if (input instanceof Headers) {
    return Object.fromEntries(input.entries());
  }
  if (Array.isArray(input)) {
    return Object.fromEntries(input);
  }
  return { ...(input as Record<string, string>) };
}

function normalizeInit(init?: RequestInit): RequestInit | undefined {
  if (!init) {
    return init;
  }
  if (!init.body) {
    return init;
  }
  const candidate = init.body as unknown;
  if (!isPlainObject(candidate)) {
    return init;
  }
  const normalizedHeaders = headersToObject(init.headers);
  if (!normalizedHeaders['Content-Type']) {
    normalizedHeaders['Content-Type'] = 'application/json';
  }
  return {
    ...init,
    headers: normalizedHeaders,
    body: JSON.stringify(candidate),
  };
}

function decodeBase64Url(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    if (typeof atob === 'function') {
      return atob(`${normalized}${padding}`);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
    }
  } catch {
    return null;
  }
  return null;
}

function decodeJwtSub(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = decodeBase64Url(parts[1]);
    if (!payload) {
      return null;
    }
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return typeof parsed.sub === 'string' ? parsed.sub : null;
  } catch {
    return null;
  }
}

function resolveAuthTokenSub(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const snapshot = readAuthSnapshot();
  return decodeJwtSub(snapshot?.access_token ?? null);
}

async function readResponseBody(response: Response): Promise<{ text: string; json: unknown | null }> {
  const text = await response.text();
  if (!text) {
    return { text: '', json: null };
  }
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function resolveActivitiesAuthorization(): string | undefined {
  const prefix = (process.env.NEXT_PUBLIC_ACTIVITIES_CORE_BEARER_PREFIX || '').trim();
  let userId = '';
  if (typeof window !== 'undefined') {
    const authUser = readAuthUser();
    userId = authUser?.userId?.trim() || '';
  }
  if (!userId) {
    const demo = getDemoUserId();
    if (typeof demo === 'string') {
      userId = demo.trim();
    }
  }
  if (!userId) {
    return undefined;
  }
  const token = prefix ? `${prefix}${prefix.endsWith(':') ? '' : ':'}${userId}` : userId;
  return `Bearer ${token}`;
}

// Attach auth headers for every request if available
api.interceptors?.request?.use?.((config) => {
  const snapshot = typeof window !== 'undefined' ? readAuthSnapshot() : null;
  const resolved = resolveAuthHeaders(snapshot);
  if (!resolved || Object.keys(resolved).length === 0) {
    return config;
  }

  if (config.headers && typeof (config.headers as { set?: unknown }).set === 'function') {
    const headerBag = config.headers as { set: (key: string, value: string, overwrite?: boolean) => void; has?: (key: string) => boolean };
    const has = typeof headerBag.has === 'function' ? headerBag.has.bind(headerBag) : undefined;
    for (const [key, value] of Object.entries(resolved)) {
      if (!has || !has(key)) {
        headerBag.set(key, value, false);
      }
    }
    return config;
  }

  const bag = (config.headers ?? {}) as Record<string, string>;
  const lowerKeys = new Set(Object.keys(bag).map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(resolved)) {
    if (!lowerKeys.has(key.toLowerCase())) {
      bag[key] = value;
      lowerKeys.add(key.toLowerCase());
    }
  }
  // Ensure headers object exists, then copy keys to avoid replacing AxiosHeaders instance.
  if (!config.headers) {
    (config as { headers?: Record<string, unknown> }).headers = {};
  }
  for (const [key, value] of Object.entries(bag)) {
    (config.headers as unknown as Record<string, unknown>)[key] = value;
  }
  return config;
});

function resolveCore(path: string): string {
  if (!CORE_BASE) {
    return path;
  }
  return path.startsWith('/') ? `${CORE_BASE}${path}` : `${CORE_BASE}/${path}`;
}

export function resolveActivitiesCoreUrl(path: string): string {
  // If path is for a websocket (starts with /activities/session/), we might need to prepend /api
  // if CORE_BASE is just a relative path like '/api'
  if (path.includes('/activities/session/') && CORE_BASE === '/api') {
    return `/api${path.startsWith('/') ? path : '/' + path}`;
  }
  return resolveCore(path);
}

function buildRequestAuthHeaders(): Record<string, string> {
  const headerBag = new Headers();
  headerBag.set('Content-Type', 'application/json');
  if (typeof window !== 'undefined') {
    const snapshot = readAuthSnapshot();
    const resolved = resolveAuthHeaders(snapshot);
    for (const [key, value] of Object.entries(resolved)) {
      headerBag.set(key, value);
    }
  }
  const activitiesAuth = resolveActivitiesAuthorization();
  if (activitiesAuth) {
    headerBag.set('Authorization', activitiesAuth);
  }
  const selfUser = getSelf();
  if (selfUser) {
    headerBag.set('X-User-Id', selfUser);
  }
  return Object.fromEntries(headerBag.entries());
}

function mergeHeadersCaseInsensitive(...sources: Array<Record<string, string>>): Record<string, string> {
  const merged = new Map<string, string>();
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      merged.set(key.toLowerCase(), value);
    }
  }
  return Object.fromEntries(merged.entries());
}

async function coreRequestRaw(path: string, init?: RequestInit): Promise<Response> {
  const normalizedInit = normalizeInit(init);
  const headers = mergeHeadersCaseInsensitive(buildRequestAuthHeaders(), headersToObject(normalizedInit?.headers));
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && path.includes('/activities/session')) {
    console.debug('[coreRequest]', 'to:', resolveCore(path), path, normalizedInit?.method ?? 'GET', {
      authorization: headers.authorization ?? null,
      xUserId: headers['x-user-id'] ?? null,
    });
  }
  const url = resolveCore(path);
  let response: Response;
  try {
    response = await fetch(url, {
      ...(normalizedInit ?? {}),
      method: normalizedInit?.method ?? 'GET',
      credentials: 'include',
      headers,
    });
  } catch (err) {
    const baseHint = CORE_BASE || DEFAULT_ACTIVITIES_CORE;
    const message = `[activities-core] Network request failed for ${url}. ` +
      `Ensure the activities-core service is running at ${baseHint} or set NEXT_PUBLIC_ACTIVITIES_CORE_URL.`;
    if (err instanceof Error) {
      throw new Error(`${message} (${err.message})`);
    }
    throw new Error(message);
  }

  if (!response.ok) {
    // Special-case 410 Gone for session lifecycle calls so callers
    // can treat it as a "session already ended" signal instead of
    // a generic network error.
    if (response.status === 410 && path.includes('/activities/session/')) {
      if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.info('[activities-core] session already gone', { path, url, status: response.status });
      }
      return response;
    }
    // Try to extract a helpful error message from JSON error payloads.
    const text = await response.text();
    try {
      const parsed = text ? JSON.parse(text) : null;
      if (parsed?.error) {
        throw new Error(String(parsed.error));
      }
    } catch {
      // fall through to generic error
    }
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response;
}

async function coreRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await coreRequestRaw(path, init);
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return undefined as T;
}

// Identity placeholder (replace with real auth integration later)
export function getSelf(): string {
  if (typeof window === 'undefined') {
    return getDemoUserId();
  }
  const authUser = readAuthUser();
  const userId = authUser?.userId?.trim();
  if (userId) {
    return userId;
  }
  const demo = getDemoUserId();
  return typeof demo === 'string' && demo.trim() ? demo.trim() : 'anonymous-user';
}

// Debug helpers — temporary utilities to confirm auth wiring during development.
export function __debugActivitiesAuthHeader(): string | null {
  const header = resolveActivitiesAuthorization();
  return header ?? null;
}

export function __debugSelfUser(): string | null {
  const self = getSelf();
  return self ?? null;
}

// --- New activity-centric API (maps to FastAPI /activities routes) ---

export async function createTicTacToeSession(opponentId?: string): Promise<string> {
  const self = getSelf();
  const result = await coreRequest<{ sessionId?: string }>(
    '/activities/session',
    {
      method: 'POST',
      body: {
        activityKey: 'tictactoe',
        creatorUserId: self || 'anonymous',
        opponentId,
      } as unknown as BodyInit,
    },
  );
  const sessionId = result?.sessionId;
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('session_create_failed');
  }
  return sessionId.trim();
}

export interface ActivitySummary {
  id: string; kind: 'typing_duel' | 'story_builder' | 'trivia' | 'rps'; state: string;
  user_a: string; user_b: string; meta: Record<string, unknown>; started_at?: string; ended_at?: string;
}

export interface ActivityDetail extends ActivitySummary {
  rounds: Array<{
    id: string;
    idx: number;
    state: string;
    opened_at?: string;
    closed_at?: string;
    meta: Record<string, unknown>;
  }>;
}

export async function createTypingDuel(peerId: string): Promise<ActivitySummary> {
  // POST /activities/with/{peerId} body { kind: 'typing_duel' }
  const res = await api.post(`/activities/with/${peerId}`, { kind: 'typing_duel' });
  return res.data as ActivitySummary;
}

export async function startActivity(activityId: string): Promise<ActivitySummary> {
  const res = await api.post(`/activities/${activityId}/start`);
  return res.data as ActivitySummary;
}

export interface TypingPrompt { prompt: string; duration_s: number; close_at_ms: number; }
export async function fetchTypingPrompt(activityId: string): Promise<TypingPrompt> {
  const res = await api.get(`/activities/${activityId}/typing/prompt`);
  return res.data as TypingPrompt;
}

export interface ActivityScorePayload { activity_id: string; totals: Record<string, number>; per_round: Array<Record<string, number>>; }
export async function submitTyping(activityId: string, roundIdx: number, text: string): Promise<ActivityScorePayload> {
  const res = await api.post('/activities/typing/submissions', { activity_id: activityId, round_idx: roundIdx, text });
  return res.data as ActivityScorePayload;
}

export async function fetchActivity(activityId: string): Promise<ActivitySummary> {
  const res = await api.get(`/activities/${activityId}`);
  return res.data as ActivitySummary;
}

export async function getActivity(activityId: string): Promise<ActivityDetail> {
  const headers = resolveAuthHeaders(readAuthSnapshot());
  const response = await api.get(`/activities/${activityId}`, { headers });
  return response.data;
}

// Legacy session-based compatibility wrappers (for tests/older UIs). Prefer new activity APIs above.
export async function createSession(kind: string, participants: string[]): Promise<{ sessionId: string }> {
  if (kind !== 'speed_typing') {
    throw new Error('Only speed_typing legacy kind is supported');
  }
  const self = getSelf();
  const peers = participants.filter((p) => p && p !== self);
  const peer = peers[0] ?? participants.find((p) => p) ?? null;
  if (!peer) {
    throw new Error('Peer id required');
  }
  const uniqueParticipants = Array.from(new Set([self, peer]));
  if (uniqueParticipants.length !== 2) {
    throw new Error('Two participants required');
  }

  const payload = await coreRequest<{ sessionId: string }>('/activities/session', {
    method: 'POST',
    body: JSON.stringify({
      activityKey: 'speed_typing',
      creatorUserId: self,
      participants: uniqueParticipants,
      // Dev fallback: some environments strip Authorization or custom headers via CORS.
      // Backend auth plugin will accept body.userId in dev/insecure mode to infer identity.
      userId: self,
    }),
  });

  return payload;
}

export async function createSpeedTypingSession(peerUserId: string): Promise<{ sessionId: string }> {
  const self = getSelf();
  const peer = (peerUserId || '').trim();
  if (!peer) {
    throw new Error('Peer id required');
  }
  if (peer === self) {
    throw new Error('Invite a different user id');
  }
  const participants = Array.from(new Set([self, peer]));
  if (participants.length !== 2) {
    throw new Error('Two unique participants required');
  }

  return coreRequest<{ sessionId: string }>('/activities/session', {
    method: 'POST',
    body: JSON.stringify({
      activityKey: 'speed_typing',
      creatorUserId: self,
      participants,
      userId: self,
    }),
  });
}

export async function createQuickTriviaSession(peerUserId: string): Promise<{ sessionId: string }> {
  const self = getSelf();
  const peer = (peerUserId || '').trim();
  if (!peer) {
    throw new Error('Peer id required');
  }
  if (peer === self) {
    throw new Error('Invite a different user id');
  }
  const participants = Array.from(new Set([self, peer]));
  if (participants.length !== 2) {
    throw new Error('Two unique participants required');
  }

  return coreRequest<{ sessionId: string }>('/activities/session', {
    method: 'POST',
    body: JSON.stringify({
      activityKey: 'quick_trivia',
      creatorUserId: self,
      participants,
      userId: self,
    }),
  });
}

export async function createRockPaperScissorsSession(peerUserId: string): Promise<{ sessionId: string }> {
  const self = getSelf();
  const peer = (peerUserId || '').trim();
  if (!peer) {
    throw new Error('Peer id required');
  }
  if (peer === self) {
    throw new Error('Invite a different user id');
  }
  const participants = Array.from(new Set([self, peer]));
  if (participants.length !== 2) {
    throw new Error('Two unique participants required');
  }

  return coreRequest<{ sessionId: string }>('/activities/session', {
    method: 'POST',
    body: JSON.stringify({
      activityKey: 'rock_paper_scissors',
      creatorUserId: self,
      participants,
      userId: self,
    }),
  });
}

export async function createStoryBuilderSession(peerUserId: string): Promise<{ sessionId: string }> {
  const self = getSelf();
  const peer = (peerUserId || '').trim();
  if (!peer) {
    throw new Error('Peer id required');
  }
  if (peer === self) {
    throw new Error('Invite a different user id');
  }
  const participants = Array.from(new Set([self, peer]));
  if (participants.length !== 2) {
    throw new Error('Two unique participants required');
  }

  // 1. Create activity on Python backend to generate invite/notification
  // We use 'story_builder' kind which matches what the backend expects for this flow
  const backendRes = await api.post(`/activities/with/${peer}`, {
    kind: 'story_builder',
    options: {}
  });
  const backendId = backendRes.data?.id;

  if (!backendId) {
    throw new Error('Failed to create backend activity');
  }

  // 2. Initialize session on activities-core with the same ID
  return coreRequest<{ sessionId: string }>('/activities/session', {
    method: 'POST',
    body: JSON.stringify({
      activityKey: 'story_builder',
      creatorUserId: self,
      participants,
      userId: self,
      sessionId: backendId // Pass the backend ID to sync them
    }),
  });
}

export interface SpeedTypingSessionSnapshot {
  id: string;
  participants?: Array<{ userId: string; score: number }>;
  presence?: Array<{ userId: string; joined: boolean; ready: boolean }>;
}

export async function fetchSessionSnapshot(sessionId: string): Promise<SpeedTypingSessionSnapshot> {
  return coreRequest<SpeedTypingSessionSnapshot>(`/activities/session/${sessionId}`);
}

export interface SpeedTypingLobbySummary {
  id: string;
  activityKey: 'speed_typing';
  status: 'pending' | 'running' | 'ended';
  phase: 'lobby' | 'countdown' | 'running' | 'ended';
  lobbyReady: boolean;
  creatorUserId: string;
  participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
  createdAt?: number;
}

export interface TicTacToeLobbySummary {
  id: string;
  activityKey: 'tictactoe';
  status: 'pending' | 'running' | 'ended';
  phase: 'lobby' | 'countdown' | 'running' | 'ended';
  lobbyReady: boolean;
  creatorUserId: string;
  participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
  createdAt?: number;
}

export interface QuickTriviaCountdown {
  startedAt: number;
  durationMs: number;
  endsAt: number;
  reason?: 'lobby' | 'intermission';
  nextRoundIndex?: number;
}

export interface QuickTriviaLobbySummary {
  id: string;
  activityKey: 'quick_trivia';
  status: 'pending' | 'running' | 'ended';
  phase: 'lobby' | 'countdown' | 'running' | 'ended';
  lobbyReady: boolean;
  creatorUserId: string;
  participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
  countdown?: QuickTriviaCountdown;
  createdAt?: number;
}

export interface RockPaperScissorsCountdown {
  startedAt: number;
  durationMs: number;
  endsAt: number;
  reason?: 'lobby';
}

export interface RockPaperScissorsLobbySummary {
  id: string;
  activityKey: 'rock_paper_scissors';
  status: 'pending' | 'running' | 'ended';
  phase: 'lobby' | 'countdown' | 'running' | 'ended';
  lobbyReady: boolean;
  creatorUserId: string;
  participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
  countdown?: RockPaperScissorsCountdown;
  expiresAt?: number;
  createdAt?: number;
}

export interface StoryBuilderLobbySummary {
  id: string;
  activityKey: 'story_builder';
  status: 'pending' | 'running' | 'ended';
  phase: 'lobby' | 'ready_check' | 'role_selection' | 'countdown' | 'running' | 'completed';
  lobbyReady: boolean;
  creatorUserId: string;
  participants: Array<{ userId: string; ready: boolean; joined: boolean; role?: 'boy' | 'girl' }>;
  countdown?: { startedAt: number; durationMs: number; endsAt: number } | null;
  createdAt?: number;
}

export async function listSpeedTypingSessions(status: 'pending' | 'running' | 'ended' | 'all' = 'pending'): Promise<SpeedTypingLobbySummary[]> {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  const payload = await coreRequest<{ sessions?: Array<SpeedTypingLobbySummary | QuickTriviaLobbySummary | RockPaperScissorsLobbySummary | StoryBuilderLobbySummary | TicTacToeLobbySummary> }>(`/activities/sessions${query}`);
  return Array.isArray(payload?.sessions) ? payload.sessions.filter((s) => s.activityKey === 'speed_typing') as SpeedTypingLobbySummary[] : [];
}

export async function listTicTacToeSessions(status: 'pending' | 'running' | 'ended' | 'all' = 'pending'): Promise<TicTacToeLobbySummary[]> {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  const payload = await coreRequest<{ sessions?: Array<SpeedTypingLobbySummary | QuickTriviaLobbySummary | RockPaperScissorsLobbySummary | StoryBuilderLobbySummary | TicTacToeLobbySummary> }>(`/activities/sessions${query}`);
  return Array.isArray(payload?.sessions) ? payload.sessions.filter((s) => s.activityKey === 'tictactoe') as TicTacToeLobbySummary[] : [];
}

export async function listQuickTriviaSessions(status: 'pending' | 'running' | 'ended' | 'all' = 'pending'): Promise<QuickTriviaLobbySummary[]> {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  const payload = await coreRequest<{ sessions?: Array<SpeedTypingLobbySummary | QuickTriviaLobbySummary | RockPaperScissorsLobbySummary | StoryBuilderLobbySummary> }>(`/activities/sessions${query}`);
  return Array.isArray(payload?.sessions) ? payload.sessions.filter((s) => s.activityKey === 'quick_trivia') as QuickTriviaLobbySummary[] : [];
}

export async function listRockPaperScissorsSessions(status: 'pending' | 'running' | 'ended' | 'all' = 'pending'): Promise<RockPaperScissorsLobbySummary[]> {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  const payload = await coreRequest<{ sessions?: Array<SpeedTypingLobbySummary | QuickTriviaLobbySummary | RockPaperScissorsLobbySummary | StoryBuilderLobbySummary> }>(`/activities/sessions${query}`);
  return Array.isArray(payload?.sessions)
    ? payload.sessions.filter((s) => s.activityKey === 'rock_paper_scissors') as RockPaperScissorsLobbySummary[]
    : [];
}

export async function listStoryBuilderSessions(status: 'pending' | 'running' | 'ended' | 'all' = 'pending'): Promise<StoryBuilderLobbySummary[]> {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  const payload = await coreRequest<{ sessions?: Array<SpeedTypingLobbySummary | QuickTriviaLobbySummary | RockPaperScissorsLobbySummary | StoryBuilderLobbySummary> }>(`/activities/sessions${query}`);
  return Array.isArray(payload?.sessions)
    ? payload.sessions.filter((s) => s.activityKey === 'story_builder') as StoryBuilderLobbySummary[]
    : [];
}

export async function joinSession(sessionId: string, userId: string): Promise<{ permitTtlSeconds?: number } | undefined> {
  const trimmedSession = sessionId?.trim();
  const trimmedUser = userId?.trim();
  if (!trimmedSession || !trimmedUser) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[activities-core] join aborted because sessionId/userId missing', { sessionId, userId });
    }
    throw new Error('session_missing');
  }

  const tokenSub = resolveAuthTokenSub();
  if (tokenSub && tokenSub !== trimmedUser) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[activities-core] refusing to join because JWT sub mismatch', {
        sessionId: trimmedSession,
        joinUserId: trimmedUser,
        tokenSub,
      });
    }
    throw new Error('auth_mismatch');
  }

  const response = await coreRequestRaw(`/activities/session/${trimmedSession}/join`, {
    method: 'POST',
    body: JSON.stringify({ userId: trimmedUser }),
  });

  const body = await readResponseBody(response);

  if (response.status === 202) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info('[activities-core] join accepted before websocket attach', {
        sessionId: trimmedSession,
        userId: trimmedUser,
        response: body.json ?? body.text,
      });
    }
    return (body.json as { permitTtlSeconds?: number } | null) ?? undefined;
  }

  if (response.status === 410) {
    throw new Error('session_state_missing');
  }

  if (response.status === 404) {
    throw new Error('session_not_found');
  }

  if (!response.ok) {
    const details = (body.json as { error?: string } | null)?.error || body.text || `join_failed:${response.status}`;
    throw new Error(details);
  }

  return (body.json as { permitTtlSeconds?: number } | null) ?? undefined;
}

export type LeaveSessionResult = 'left' | 'session_ended';

export async function leaveSession(sessionId: string, userId: string): Promise<LeaveSessionResult> {
  if (!sessionId || !userId) {
    return 'session_ended';
  }

  const response = await coreRequestRaw(`/activities/session/${sessionId}/leave`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

  if (response.status === 204 || response.status === 410) {
    // 204: backend explicitly treated leave as a no-op because the
    // session was already gone. 410: legacy "session_state_missing".
    return 'session_ended';
  }

  return 'left';
}

export async function setSessionReady(sessionId: string, userId: string, ready: boolean): Promise<void> {
  await coreRequest(`/activities/session/${sessionId}/ready`, {
    method: 'POST',
    body: JSON.stringify({ userId, ready }),
  });
}

export async function startSession(sessionId: string): Promise<void> {
  const self = getSelf();
  await coreRequest(`/activities/session/${sessionId}/start`, {
    method: 'POST',
    body: JSON.stringify({ userId: self, creatorUserId: self }),
  });
}
export async function submitRound(): Promise<void> {
  throw new Error('submitRound is unsupported for live sessions. Use the WebSocket stream to submit rounds.');
}

export async function setStoryReady(activityId: string, ready: boolean): Promise<ActivitySummary> {
  const headers = resolveAuthHeaders(readAuthSnapshot());
  const response = await api.post(`/activities/${activityId}/story/ready`, { ready }, { headers });
  return response.data as ActivitySummary;
}

export async function assignStoryRole(activityId: string, role: "boy" | "girl"): Promise<ActivitySummary> {
  const headers = resolveAuthHeaders(readAuthSnapshot());
  const response = await api.post(`/activities/${activityId}/story/roles`, { role }, { headers });
  return response.data;
}

export async function submitStoryTurn(activityId: string, content: string): Promise<ActivitySummary> {
  const headers = resolveAuthHeaders(readAuthSnapshot());
  const response = await api.post(`/activities/${activityId}/story/turn`, { content }, { headers });
  return response.data;
}

export async function scoreStoryLine(activityId: string, roundIdx: number, score: number): Promise<ActivitySummary> {
  const headers = resolveAuthHeaders(readAuthSnapshot());
  const response = await api.post(`/activities/${activityId}/story/score`, { roundIdx, score }, { headers });
  return response.data;
}
