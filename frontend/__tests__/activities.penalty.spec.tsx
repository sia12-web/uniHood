import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';

vi.mock('@/lib/auth-storage', () => ({
  readAuthSnapshot: () => ({ access_token: 'token;uid=test-user;campus:test-campus' }),
}));

vi.mock('@/app/features/activities/api/client', () => ({
  createSession: vi.fn().mockResolvedValue({ sessionId: 's1' }),
  joinSession: vi.fn().mockResolvedValue(undefined),
  leaveSession: vi.fn().mockResolvedValue(undefined),
  setSessionReady: vi.fn().mockResolvedValue(undefined),
  startSession: vi.fn().mockResolvedValue(undefined),
  getSelf: () => 'test-user',
}));

import { LiveSessionShell } from '@/app/features/activities/components/LiveSessionShell';

class WSStub {
  readyState = 1;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  sent: any[] = [];
  private listeners: Record<string, Array<(event: any) => void>> = {};

  constructor(public url: string) {}

  send(data: any) { this.sent.push(data); }
  close() {}

  addEventListener(type: string, handler: (event: any) => void) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(handler);
    if (type === 'open') {
      this.onopen = (event) => this.emit('open', event);
    }
    if (type === 'message') {
      this.onmessage = (event) => this.emit('message', event);
    }
    if (type === 'error') {
      this.onerror = (event) => this.emit('error', event);
    }
    if (type === 'close') {
      this.onclose = (event) => this.emit('close', event);
    }
  }

  emit(type: string, event: any) {
    for (const handler of this.listeners[type] ?? []) {
      handler(event);
    }
  }
}

declare global { interface Window { WebSocket: any } }

describe('Penalty banner', () => {
  let ws: WSStub;
  const origWS = window.WebSocket;
  beforeEach(() => {
    ws = new WSStub('ws://test');
    // @ts-ignore
    window.WebSocket = vi.fn(() => ws);
  });
  afterEach(() => { window.WebSocket = origWS; });

  it('shows and auto-hides penalty banner', async () => {
    render(<LiveSessionShell sessionId="s1" opponentUserId="peer" />);

    await act(async () => { await Promise.resolve(); });
    act(() => {
      ws.emit('open', {});
    });
    await act(async () => { await Promise.resolve(); });
    act(() => {
      ws.emit('message', { data: JSON.stringify({ type: 'activity.penalty.applied', payload: { type: 'paste_detected', reason: 'Paste detected — penalty applied' } }) });
    });

    expect(await screen.findByText(/penalty applied/i)).toBeTruthy();

  // Advance TTL (1200ms in hook) to allow auto-dismiss
  await act(async () => { await new Promise(r => setTimeout(r, 1300)); });

    const gone = screen.queryByText(/penalty applied/i);
    expect(gone).toBeNull();
  });
});
