import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SpeedTypingPanel } from '../app/features/activities/components/SpeedTypingPanel';

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

describe('Telemetry & Anti-Cheat', () => {
  let ws: WSStub;
  const origWS = window.WebSocket;
  beforeEach(() => {
    ws = new WSStub('ws://test');
    // @ts-ignore
    window.WebSocket = vi.fn(() => ws);
  });
  afterEach(() => { window.WebSocket = origWS; });

  it('emits keystrokes with throttle/delta and handles paste warning', async () => {
    render(<SpeedTypingPanel sessionId="s1" />);
    // Simulate round started to enter running state
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'activity.round.started', payload: { payload: { textSample: 'hello', timeLimitMs: 60000 }, index: 0 } }) });
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
    expect(await screen.findByText(/paste detected/i)).toBeTruthy();
  });
});
