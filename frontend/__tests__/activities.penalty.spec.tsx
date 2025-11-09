import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LiveSessionShell } from '../app/features/activities/components/LiveSessionShell';

class WSStub {
  readyState = 1;
  onopen: any;
  onmessage: any;
  onerror: any;
  onclose: any;
  sent: any[] = [];
  constructor(public url: string) {}
  send(data: any) { this.sent.push(data); }
  close() {}
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

    // Simulate penalty
    // Ensure ws.onopen has fired so hook state progressed
    act(() => { ws.onopen?.(); });
    await act(async () => { await Promise.resolve(); });
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'activity.penalty.applied', payload: { type: 'paste_detected', reason: 'Paste detected — penalty applied' } }) });
    });

    expect(await screen.findByText(/penalty applied/i)).toBeTruthy();

  // Advance TTL (1200ms in hook) to allow auto-dismiss
  await act(async () => { await new Promise(r => setTimeout(r, 1300)); });

    const gone = screen.queryByText(/penalty applied/i);
    expect(gone).toBeNull();
  });
});
