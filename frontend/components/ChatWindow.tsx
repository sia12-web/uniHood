"use client";

import clsx from "clsx";
import { format, formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChatMessage } from "../lib/chat";

export type MessageStatus = "sending" | "sent" | "delivered" | "error";

export type ChatDisplayMessage = ChatMessage & {
  status: MessageStatus;
  isOwn: boolean;
  /** Optional inline error description. */
  error?: string | null;
};

type FriendPresence = {
  online: boolean;
  lastSeen?: string | null;
};

type Props = {
  conversationId: string;
  friendName: string;
  friendHandle?: string | null;
  friendPresence?: FriendPresence | null;
  messages: ChatDisplayMessage[];
  onSend: (body: string) => Promise<void>;
  onTyping?: () => void;
  typingLabel?: string | null;
  loadingHistory?: boolean;
};

const EMOJI_PALETTE = ["😀", "😂", "😊", "👍", "❤️", "🎉", "🙏", "🤔"];

export default function ChatWindow({
  conversationId,
  friendName,
  friendHandle,
  friendPresence,
  messages,
  onSend,
  onTyping,
  typingLabel,
  loadingHistory,
}: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const messageLogRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const presenceText = useMemo(() => {
    if (!friendPresence) {
      return "";
    }
    if (friendPresence.online) {
      return "Online";
    }
    if (friendPresence.lastSeen) {
      try {
        return `Last seen ${formatDistanceToNow(new Date(friendPresence.lastSeen), { addSuffix: true })}`;
      } catch {
        return "Offline";
      }
    }
    return "Offline";
  }, [friendPresence]);

  const groupedMessages = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: ChatDisplayMessage[] }> = [];
    for (const message of messages) {
      const date = new Date(message.createdAt);
      const key = format(date, "yyyy-MM-dd");
      let group = groups.find((entry) => entry.key === key);
      if (!group) {
        group = {
          key,
          label: format(date, "EEEE, MMM d"),
          items: [],
        };
        groups.push(group);
      }
      group.items.push(message);
    }
    return groups;
  }, [messages]);

  const adjustTextareaHeight = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [draft]);

  useEffect(() => {
    const element = messageLogRef.current;
    if (!element) {
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setDraft("");
    setEmojiOpen(false);
  }, [conversationId]);

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const insertEmoji = (emoji: string) => {
    setDraft((prev) => `${prev}${emoji}`);
    setEmojiOpen(false);
    textareaRef.current?.focus();
    onTyping?.();
  };

  return (
    <div className="flex h-full flex-col bg-cream/40">
      <header className="flex items-center justify-between border-b border-warm-sand bg-cream px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-midnight" aria-label="Conversation partner">
            {friendName}
          </p>
          {friendHandle ? (
            <p className="text-xs text-navy/60">@{friendHandle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2" aria-label="Presence status">
          <span
            className={clsx("h-2.5 w-2.5 rounded-full", friendPresence?.online ? "bg-emerald-500" : "bg-slate-400")}
            data-testid="presence-badge"
          />
          <span className="text-xs text-navy/70">{presenceText}</span>
        </div>
      </header>
      <div
        ref={messageLogRef}
        className="flex-1 space-y-6 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {loadingHistory ? (
          <div className="flex justify-center" aria-label="Loading messages">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-midnight" />
          </div>
        ) : null}
        {groupedMessages.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="flex items-center gap-4 text-xs text-navy/50">
              <span className="h-px flex-1 bg-warm-sand/70" />
              <span>{group.label}</span>
              <span className="h-px flex-1 bg-warm-sand/70" />
            </div>
            {group.items.map((message) => {
              const createdAt = new Date(message.createdAt);
              const statusLabel =
                message.status === "sending"
                  ? "Sending…"
                : message.status === "error"
                ? message.error ?? "Failed to send"
                : message.status === "delivered"
                ? "Delivered"
                : "Sent";
              const bubbleClass = message.isOwn
                ? "ml-auto bg-midnight text-white"
                : "mr-auto bg-warm-sand text-midnight";
              const detailTone = message.isOwn ? "text-white/70" : "text-navy/60";
              return (
                <article
                  key={message.messageId || `${message.clientMsgId}`}
                  className={clsx("max-w-xl rounded-3xl px-4 py-2 shadow-sm", bubbleClass)}
                  title={`${format(createdAt, "PPpp")} • ${statusLabel}`}
                  data-testid={message.isOwn ? "message-outgoing" : "message-incoming"}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                  <div className={clsx("mt-1 flex items-center gap-2 text-[11px]", detailTone)}>
                    <span>{format(createdAt, "p")}</span>
                    <span aria-live="polite">{statusLabel}</span>
                  </div>
                </article>
              );
            })}
          </section>
        ))}
        {typingLabel ? (
          <p className="text-xs text-navy/70" aria-live="assertive" data-testid="typing-indicator">
            {typingLabel}
          </p>
        ) : null}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="border-t border-warm-sand bg-white/95 px-4 py-3"
      >
        <div className="flex items-end gap-2">
          <div className="relative">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-warm-sand text-xl text-navy transition hover:bg-warm-sand/60"
              onClick={() => setEmojiOpen((prev) => !prev)}
              aria-label="Insert emoji"
            >
              😊
            </button>
            {emojiOpen ? (
              <div className="absolute bottom-12 left-0 z-10 grid w-40 grid-cols-4 gap-2 rounded-xl border border-warm-sand bg-white p-2 shadow-lg">
                {EMOJI_PALETTE.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="flex items-center justify-center rounded-lg text-xl transition hover:bg-warm-sand/70"
                    onClick={() => insertEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex-1">
            <label htmlFor="chat-draft" className="sr-only">
              Message input
            </label>
            <textarea
              id="chat-draft"
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                onTyping?.();
              }}
              onKeyDown={handleKeyDown}
              className="max-h-60 w-full resize-none rounded-2xl border border-warm-sand bg-white px-4 py-3 text-sm shadow-inner focus:border-midnight focus:outline-none"
              placeholder="Type a message"
              aria-multiline="true"
              rows={1}
              disabled={sending}
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-full bg-midnight px-5 text-sm font-semibold text-white transition hover:bg-navy disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
