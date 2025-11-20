import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QuickTriviaPanel } from '../app/features/activities/components/QuickTriviaPanel';

class WSStub {
  readyState = 1;
  sent: any[] = [];
  private listeners: Record<string, Set<(event: any) => void>> = {};
  constructor(public url: string) {}
  send(data: any) { this.sent.push(data); }
  close() { this.emit('close', { type: 'close' }); }
  addEventListener(type: string, handler: (event: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(handler);
  }
  removeEventListener(type: string, handler: (event: any) => void) {
    this.listeners[type]?.delete(handler);
  }
  emit(type: string, event: any = {}) {
    this.listeners[type]?.forEach((handler) => handler(event));
  }
  listenerCount(type: string): number {
    return this.listeners[type]?.size ?? 0;
  }
}

declare global { interface Window { WebSocket: any } }

describe('QuickTriviaPanel', () => {
  let ws: WSStub;
  const origWS = window.WebSocket;
  const origFetch = global.fetch;
  const okResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    ws = new WSStub('ws://test');
    // @ts-ignore
    window.WebSocket = vi.fn(() => ws);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (typeof url === 'string' && url.includes('/activities/session/')) {
        return okResponse();
      }
      return new Response(null, { status: 200 });
    });
    global.fetch = fetchMock as typeof global.fetch;
    if (typeof window !== 'undefined') {
      (window as unknown as { fetch?: typeof fetch }).fetch = fetchMock as typeof fetch;
    }
  });

  afterEach(() => {
    window.WebSocket = origWS;
    global.fetch = origFetch;
    if (typeof window !== 'undefined') {
      (window as unknown as { fetch?: typeof fetch }).fetch = origFetch as typeof fetch;
    }
  });

  it('locks after selection', async () => {
    render(<QuickTriviaPanel sessionId="s1" />);
    await waitFor(() => expect(ws.listenerCount('open')).toBeGreaterThan(0));
    await act(async () => { ws.emit('open'); });
    await waitFor(() => expect(ws.listenerCount('message')).toBeGreaterThan(0));
    await act(async () => {
      ws.emit('message', { data: JSON.stringify({ type: 'activity.round.started', payload: { payload: { question: 'Q?', options: ['A','B','C','D'], timeLimitMs: 60000 }, index: 0 } }) });
    });

    const option = await screen.findByLabelText('A', { exact: false });
    await act(async () => { fireEvent.click(option); });

    // Locked chip visible
    expect(await screen.findByText(/Locked/i)).toBeTruthy();
    // Inputs disabled
    expect((option as HTMLInputElement).disabled).toBe(true);
  });

  it('shows session expired banner when ended before start', async () => {
    render(<QuickTriviaPanel sessionId="s1" />);
    await waitFor(() => expect(ws.listenerCount('open')).toBeGreaterThan(0));
    await act(async () => { ws.emit('open'); });
    await waitFor(() => expect(ws.listenerCount('message')).toBeGreaterThan(0));
    await act(async () => {
      ws.emit('message', { data: JSON.stringify({ type: 'activity.session.ended', payload: {} }) });
    });

    expect(await screen.findByText(/Session expired, please start a new one/i)).toBeTruthy();
  });

  it('ignores round started events after expiration', async () => {
    render(<QuickTriviaPanel sessionId="s1" />);
    await waitFor(() => expect(ws.listenerCount('open')).toBeGreaterThan(0));
    await act(async () => { ws.emit('open'); });
    await waitFor(() => expect(ws.listenerCount('message')).toBeGreaterThan(0));
    await act(async () => {
      ws.emit('message', { data: JSON.stringify({ type: 'activity.session.ended', payload: {} }) });
    });

    expect(await screen.findByText(/Session expired, please start a new one/i)).toBeTruthy();

    await act(async () => {
      ws.emit('message', { data: JSON.stringify({ type: 'activity.round.started', payload: { payload: { question: 'Q?', options: ['A','B'], timeLimitMs: 10000 }, index: 0 } }) });
    });

    expect(screen.getByText(/Session expired, please start a new one/i)).toBeTruthy();
    expect(screen.queryByText('Q?')).toBeNull();
  });

  it('hydrates scoreboard from snapshot payload', async () => {
    render(<QuickTriviaPanel sessionId="s1" />);
    await waitFor(() => expect(ws.listenerCount('open')).toBeGreaterThan(0));
    await act(async () => { ws.emit('open'); });
    await waitFor(() => expect(ws.listenerCount('message')).toBeGreaterThan(0));
    await act(async () => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'session.snapshot',
          payload: {
            status: 'running',
            lobbyPhase: false,
            scoreboard: { participants: [ { userId: 'p1', score: 42 }, { userId: 'p2', score: 18 } ] },
            presence: [ { userId: 'p1', joined: true, ready: true }, { userId: 'p2', joined: true, ready: true } ],
            currentRoundIndex: 3,
          },
        }),
      });
    });

    expect((await screen.findAllByText('p1')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('p2')).length).toBeGreaterThan(0);
  });

  it('shows tie-break winner copy when provided', async () => {
    render(<QuickTriviaPanel sessionId="s1" />);
    await waitFor(() => expect(ws.listenerCount('open')).toBeGreaterThan(0));
    await act(async () => { ws.emit('open'); });
    await waitFor(() => expect(ws.listenerCount('message')).toBeGreaterThan(0));
    await act(async () => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'session.snapshot',
          payload: {
            status: 'running',
            lobbyPhase: false,
            participants: [ { userId: 'p1', score: 30 }, { userId: 'p2', score: 30 } ],
            presence: [ { userId: 'p1', joined: true, ready: true }, { userId: 'p2', joined: true, ready: true } ],
          },
        }),
      });
    });
    await act(async () => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'activity.round.started',
          payload: { payload: { question: 'Q?', options: ['A', 'B'], timeLimitMs: 15000 }, index: 0 },
        }),
      });
    });
    await waitFor(() => expect(screen.queryByText(/Waiting for round/i)).toBeNull());
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'activity.session.ended',
          payload: {
            finalScoreboard: { participants: [ { userId: 'p1', score: 30 }, { userId: 'p2', score: 30 } ] },
            tieBreak: { winnerUserId: 'p2' },
            winnerUserId: 'p1',
          },
        }),
      });
    });

    expect(await screen.findByText(/Winner by time advantage:\s*p2/i)).toBeTruthy();
  });
});
