import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QuickTriviaPanel } from '../app/features/activities/components/QuickTriviaPanel';

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

describe('QuickTrivia WS Flow', () => {
  let ws: WSStub;
  const origWS = window.WebSocket;
  beforeEach(() => {
    ws = new WSStub('ws://test');
    // @ts-ignore
    window.WebSocket = vi.fn(() => ws);
  });
  afterEach(() => { window.WebSocket = origWS; });

  it('reveals correct answer after round end', async () => {
    render(<QuickTriviaPanel sessionId="s1" />);
    act(() => { ws.onopen?.(); });
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'activity.round.started', payload: { payload: { question: 'Q?', options: ['A','B','C','D'], timeLimitMs: 60000 }, index: 0 } }) });
    });

    const optionB = await screen.findByLabelText('B', { exact: false });
    await act(async () => { fireEvent.click(optionB); });

    // simulate round ended with correctIndex=2 (C)
    act(() => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'activity.round.ended', payload: { correctIndex: 2 } }) });
    });

    // correct option has Correct badge
    expect(await screen.findByText(/Correct/i)).toBeTruthy();
  });
});
