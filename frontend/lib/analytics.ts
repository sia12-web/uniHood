// Minimal analytics stub. Safe no-op in tests; logs in dev.
// Unified activity analytics. Prefer activityId; sessionId kept optional for backward compatibility.
export type AnalyticsEvent =
  | { name: 'activity.start_click'; props: { kind: string; peerId?: string } }
  | { name: 'activity.session_started'; props: { activityId?: string; sessionId?: string; kind: string } }
  | { name: 'activity.session_ended'; props: { activityId?: string; sessionId?: string; winnerUserId?: string } }
  | { name: 'activity.keystroke'; props: { activityId?: string; sessionId?: string; len: number } }
  | { name: 'ui.toast'; props: { message: string } };

export function track<T extends AnalyticsEvent['name']>(event: T, props: Extract<AnalyticsEvent, { name: T }>['props']): void {
  try {
    // In CI/test envs, avoid noisy logging
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return;
    if (typeof window !== 'undefined' && (window as unknown as { __DISABLE_ANALYTICS__?: boolean }).__DISABLE_ANALYTICS__) return;
    // eslint-disable-next-line no-console
    console.debug(`[analytics] ${event}`, props);
  } catch {
    // swallow
  }
}

export type ActivityLogItem = {
  id: number;
  user_id: string;
  event: string;
  meta: Record<string, unknown>;
  created_at: string;
  user_display_name: string | null;
  user_avatar_url: string | null;
};

import { apiFetch } from "@/app/lib/http/client";

export async function fetchRecentActivity(limit = 20): Promise<ActivityLogItem[]> {
  return apiFetch<ActivityLogItem[]>(`/analytics/activity?limit=${limit}`);
}
