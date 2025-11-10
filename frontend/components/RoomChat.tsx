"use client";

import React, { useMemo, useState } from 'react';

import type { SocketConnectionStatus } from '@/app/lib/socket/base';

import { ReportUI } from '@/app/features/moderation/ReportButton';

import { RoomMessageDTO } from '../lib/rooms';

type Props = {
  messages: RoomMessageDTO[];
  onSend: (text: string) => Promise<void>;
  connectionStatus?: SocketConnectionStatus;
};

export default function RoomChat({ messages, onSend, connectionStatus }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const sorted = useMemo(() => [...messages].sort((a, b) => a.seq - b.seq), [messages]);
  const reconnecting = connectionStatus === 'reconnecting' || connectionStatus === 'connecting';
  const disconnected = connectionStatus === 'disconnected';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setInput('');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex-1 p-4 flex flex-col">
      {reconnecting ? (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700" role="status" aria-live="polite">
          Reconnecting…
        </div>
      ) : null}
      {disconnected ? (
        <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert" aria-live="assertive">
          Connection lost. Messages send once the connection returns.
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto space-y-2">
        {sorted.map((message) => (
          <div key={message.id} className="rounded border p-2">
            <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span className="truncate">{message.sender_id}</span>
              <div className="flex items-center gap-2">
                <span>{new Date(message.created_at).toLocaleTimeString()}</span>
                <ReportUI kind="room_message" targetId={message.id} />
              </div>
            </div>
            <div>{message.content ?? ''}</div>
          </div>
        ))}
      </div>
      <form className="mt-4 flex" onSubmit={handleSubmit}>
        <input
          className="border flex-1 p-2 mr-2"
          placeholder="Type a message..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={sending}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded" type="submit" disabled={sending}>
          Send
        </button>
      </form>
    </main>
  );
}
