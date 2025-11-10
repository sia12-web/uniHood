import axios from 'axios';

// Backend base URL (FastAPI service). Falls back to same origin if env not set.
const BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');

const CORE_BASE = (process.env.NEXT_PUBLIC_ACTIVITIES_CORE_URL || '/api').replace(/\/$/, '');

import { readAuthSnapshot } from '@/lib/auth-storage';

const api = axios.create({ baseURL: BACKEND || undefined });

// Attach auth headers for every request if available
api.interceptors?.request?.use?.((config) => {
  const auth = typeof window !== 'undefined' ? readAuthSnapshot() : null;
  if (auth?.access_token) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${auth.access_token}`;
    // Optionally add synthetic headers for dev
    const parts = auth.access_token.split(';').reduce((acc, frag) => {
      const [k, v] = frag.split(':', 2);
      if (k && v) acc[k] = v;
      return acc;
    }, {} as Record<string, string>);
    if (parts.uid) config.headers['X-User-Id'] = parts.uid;
    if (parts.campus) config.headers['X-Campus-Id'] = parts.campus;
    if (parts.handle) config.headers['X-User-Handle'] = parts.handle;
  }
  return config;
});

function resolveCore(path: string): string {
  if (!CORE_BASE) {
    return path;
  }
  return path.startsWith('/') ? `${CORE_BASE}${path}` : `${CORE_BASE}/${path}`;
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window === 'undefined') {
    return headers;
  }
  const auth = readAuthSnapshot();
  if (!auth?.access_token) {
    return headers;
  }
  headers['Authorization'] = `Bearer ${auth.access_token}`;
  const parts = auth.access_token.split(';').reduce((acc, fragment) => {
    const [k, v] = fragment.split(':', 2);
    if (k && v) {
      acc[k] = v;
    }
    return acc;
  }, {} as Record<string, string>);
  if (parts.uid) headers['X-User-Id'] = parts.uid;
  if (parts.campus) headers['X-Campus-Id'] = parts.campus;
  if (parts.handle) headers['X-User-Handle'] = parts.handle;
  return headers;
}

async function coreRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveCore(path), {
    method: init?.method ?? 'GET',
    credentials: 'include',
    ...init,
    headers: {
      ...buildAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

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
export function getSelf(): string { return 'me'; }

// --- New activity-centric API (maps to FastAPI /activities routes) ---

export interface ActivitySummary {
  id: string; kind: 'typing_duel' | 'story_alt' | 'trivia' | 'rps'; state: string;
  user_a: string; user_b: string; meta: Record<string, unknown>; started_at?: string; ended_at?: string;
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
    }),
  });

  return payload;
}
export async function joinSession(sessionId: string, userId: string): Promise<void> {
  await coreRequest(`/activities/session/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function leaveSession(sessionId: string, userId: string): Promise<void> {
  await coreRequest(`/activities/session/${sessionId}/leave`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function setSessionReady(sessionId: string, userId: string, ready: boolean): Promise<void> {
  await coreRequest(`/activities/session/${sessionId}/ready`, {
    method: 'POST',
    body: JSON.stringify({ userId, ready }),
  });
}

export async function startSession(sessionId: string): Promise<void> {
  await coreRequest(`/activities/session/${sessionId}/start`, { method: 'POST' });
}
export async function submitRound(): Promise<void> {
  throw new Error('submitRound is unsupported for live sessions. Use the WebSocket stream to submit rounds.');
}
