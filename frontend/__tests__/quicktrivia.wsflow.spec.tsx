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

describe('QuickTrivia WS Flow', () => {
  let ws: WSStub;
  const origWS = window.WebSocket;
  const origFetch = global.fetch;
  const okResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  beforeEach(() => {
    ws = new WSStub('ws://test');
    // @ts-ignore
    window.WebSocket = vi.fn(() => ws);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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

  it('reveals correct answer after round end', async () => {
    render(<QuickTriviaPanel sessionId="s1" />);
    await waitFor(() => expect(ws.listenerCount('open')).toBeGreaterThan(0));
    await act(async () => { ws.emit('open'); });
    await waitFor(() => expect(ws.listenerCount('message')).toBeGreaterThan(0));
    await act(async () => {
      ws.emit('message', { data: JSON.stringify({ type: 'activity.round.started', payload: { payload: { question: 'Q?', options: ['A','B','C','D'], timeLimitMs: 60000 }, index: 0 } }) });
    });

    const optionB = await screen.findByLabelText('B', { exact: false });
    await act(async () => { fireEvent.click(optionB); });

    // simulate round ended with correctIndex=2 (C)
    act(() => {
      ws.emit('message', { data: JSON.stringify({ type: 'activity.round.ended', payload: { correctIndex: 2 } }) });
    });

    // correct option has Correct badge
    expect(await screen.findByText(/Correct/i)).toBeTruthy();
  });
});
