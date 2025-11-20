import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/lib/auth-storage', () => ({
  readAuthSnapshot: () => ({ access_token: 'token;uid=test-user;campus:test-campus' }),
  readAuthUser: () => ({ userId: 'test-user', displayName: 'Test User', handle: 'test-user' }),
}));

const { createSessionMock } = vi.hoisted(() => ({
  createSessionMock: vi.fn().mockResolvedValue({ sessionId: 's1' }),
}));

const guardMocks = vi.hoisted(() => ({ detach: vi.fn() }));

vi.mock('@/app/features/activities/guards/typingBoxGuards', () => ({
  attachTypingBoxGuards: vi.fn(() => guardMocks.detach),
}));

vi.mock('@/app/features/activities/api/client', () => ({
  createSession: createSessionMock,
  joinSession: vi.fn().mockResolvedValue(undefined),
  leaveSession: vi.fn().mockResolvedValue('left'),
  setSessionReady: vi.fn().mockResolvedValue(undefined),
  startSession: vi.fn().mockResolvedValue(undefined),
  fetchSessionSnapshot: vi.fn().mockResolvedValue({
    id: 's1',
    participants: [{ userId: 'test-user', score: 0 }],
    presence: [{ userId: 'test-user', joined: true, ready: true }],
  }),
  getSelf: () => 'test-user',
}));

import { SpeedTypingPanel } from '@/app/features/activities/components/SpeedTypingPanel';

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

describe('Telemetry & Anti-Cheat', () => {
  let ws: WSStub;
  const origWS = window.WebSocket;
  beforeEach(() => {
    ws = new WSStub('ws://test');
    const ctor = vi.fn(() => ws) as unknown as typeof WebSocket;
    Object.assign(ctor, { OPEN: 1 });
    // @ts-ignore
    window.WebSocket = ctor;
  });
  afterEach(() => { window.WebSocket = origWS; });

  it('emits keystrokes with throttle/delta and handles paste warning', async () => {
    render(<SpeedTypingPanel sessionId="s1" />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      ws.emit('open', {});
      ws.emit('message', { data: JSON.stringify({ type: 'activity.round.started', payload: { payload: { textSample: 'hello', timeLimitMs: 60000 }, index: 0 } }) });
    });

    const ta = await screen.findByPlaceholderText(/start typing/i);
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'h' } });
    });
    await act(async () => { await new Promise(r => setTimeout(r, 120)); });
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'he' } });
    });
    await act(async () => { await new Promise(r => setTimeout(r, 120)); });
    // One keystroke message should be sent at least
    const keystrokes = ws.sent.map(String).filter(s => s.includes('"type":"keystroke"'));
    expect(keystrokes.length).toBeGreaterThanOrEqual(1);

    // Paste detection
    await act(async () => {
      fireEvent.paste(ta);
    });
    expect(await screen.findByText(/paste blocked/i)).toBeTruthy();
  });
});
