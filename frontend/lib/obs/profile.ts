'use client';

const METRICS_PATH = '/api/ops/profile-ui';

type ProfileUiEvent =
  | {
      event: 'profile_save';
      mode: 'live' | 'demo';
      changedFields: string[];
    }
  | {
      event: 'avatar_upload';
      mode: 'live' | 'demo';
      outcome: 'success' | 'queued' | 'failed';
    }
  | {
      event: 'status_preset';
      presetId: string;
    }
  | {
      event: 'passion_suggestion';
      suggestion: string;
    }
  | {
      event: 'draft_sync';
      action: 'merge' | 'discard' | 'remind';
    };

function sendWithBeacon(body: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return false;
  }
  try {
    if (typeof Blob !== 'undefined') {
      const blob = new Blob([body], { type: 'application/json' });
      return navigator.sendBeacon(METRICS_PATH, blob);
    }
    return navigator.sendBeacon(METRICS_PATH, body);
  } catch {
    return false;
  }
}

export function emitProfileMetric(event: ProfileUiEvent): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const body = JSON.stringify(event);
    if (!sendWithBeacon(body)) {
      void fetch(METRICS_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    }
  } catch {
    // best-effort; ignore failures
  }
}
