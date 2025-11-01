"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatMessage } from "../lib/chat";

type Props = {
  conversationId: string;
  onSend: (body: string) => Promise<void>;
  messages: ChatMessage[];
};

export default function ChatWindow({ conversationId, onSend, messages }: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setDraft("");
  }, [conversationId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await onSend(draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div key={msg.messageId} className="rounded bg-slate-200 p-2 text-sm">
            <div className="font-semibold">{msg.senderId}</div>
            <div className="whitespace-pre-line">{msg.body}</div>
            <div className="text-xs text-slate-600">#{msg.seq} • {new Date(msg.createdAt).toLocaleTimeString()}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="border-t bg-white p-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-24 w-full resize-none rounded border border-slate-300 p-2"
          placeholder="Type a message"
          disabled={sending}
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            className="rounded bg-blue-500 px-4 py-2 text-white disabled:bg-blue-300"
            disabled={sending || !draft.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
