import React, { useMemo, useState } from 'react';

import { RoomMessageDTO } from '../lib/rooms';

type Props = {
  messages: RoomMessageDTO[];
  onSend: (text: string) => Promise<void>;
};

export default function RoomChat({ messages, onSend }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const sorted = useMemo(() => [...messages].sort((a, b) => a.seq - b.seq), [messages]);

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
      <div className="flex-1 overflow-y-auto space-y-2">
        {sorted.map((message) => (
          <div key={message.id} className="rounded border p-2">
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>{message.sender_id}</span>
              <span>{new Date(message.created_at).toLocaleTimeString()}</span>
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
