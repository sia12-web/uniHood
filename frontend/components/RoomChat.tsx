"use client";

import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { SocketConnectionStatus } from '@/app/lib/socket/base';
import { ReportUI } from '@/app/features/moderation/ReportButton';
import { RoomMessageDTO } from '../lib/rooms';
import { Send, Loader2 } from 'lucide-react';

type Props = {
  messages: RoomMessageDTO[];
  onSend: (text: string) => Promise<void>;
  connectionStatus?: SocketConnectionStatus;
  participantNames?: Record<string, string>;
  currentUserId?: string;
};

export default function RoomChat({ messages, onSend, connectionStatus, participantNames, currentUserId }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => [...messages].sort((a, b) => a.seq - b.seq), [messages]);
  const reconnecting = connectionStatus === 'reconnecting';
  const disconnected = connectionStatus === 'disconnected';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sorted.length]);

  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      await onSend(trimmed);
      setInput('');
    } finally {
      setSending(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Connection Status Bar */}
      {(reconnecting || disconnected) && (
        <div className={`px-4 py-2 text-xs font-medium text-center ${disconnected ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
          }`}>
          {disconnected ? "Connection lost. Reconnecting..." : "Reconnecting..."}
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {sorted.length === 0 && (
          <div className="flex h-full items-center justify-center text-slate-400 text-sm">
            No messages yet. Start the conversation!
          </div>
        )}

        {sorted.map((message) => {
          const isMe = currentUserId && message.sender_id === currentUserId;
          const displayName = participantNames?.[message.sender_id] || "Unknown";
          const initial = displayName[0]?.toUpperCase() || "?";

          return (
            <div key={message.id} className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex max-w-[80%] gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>

                {/* Avatar (only for others) */}
                {!isMe && (
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                    {initial}
                  </div>
                )}

                <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {/* Name (only for others) */}
                  {!isMe && (
                    <span className="text-[10px] text-slate-500 mb-1 ml-1">
                      {displayName}
                    </span>
                  )}

                  {/* Bubble */}
                  <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe
                    ? "bg-blue-600 text-white rounded-tr-none"
                    : "bg-white text-slate-800 border border-slate-100 rounded-tl-none"
                    }`}>
                    {message.content}
                  </div>

                  {/* Time & Actions */}
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-[10px] text-slate-400">
                      {new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    {!isMe && <ReportUI kind="room_message" targetId={message.id} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200">
        <form className="flex gap-2 items-center" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="flex-1 bg-slate-100 border-0 rounded-full px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-slate-400"
            placeholder="Type a message..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={sending || disconnected}
          />
          <button
            className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            type="submit"
            disabled={sending || !input.trim() || disconnected}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
