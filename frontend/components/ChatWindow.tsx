"use client";

import clsx from "clsx";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SocketConnectionStatus } from "@/app/lib/socket/base";

import { ReportUI } from "@/app/features/moderation/ReportButton";

import type { ChatMessage } from "../lib/chat";
import { ChooseActivityModal } from '../app/features/activities/components/ChooseActivityModal';
import { LiveSessionShell } from '../app/features/activities/components/LiveSessionShell';

type Props = {
  conversationId: string;
  onSend: (body: string) => Promise<void>;
  messages: ChatMessage[];
  selfUserId: string;
  peerName?: string | null;
  peerStatusText?: string | null;
  connectionStatus?: SocketConnectionStatus;
};

const QUICK_EMOJI = ["😀", "😂", "👍", "🎉", "❤️", "😎"];

type ChatAttachment = ChatMessage["attachments"][number];
type ImageAttachment = ChatAttachment & { remoteUrl: string };

function isRenderableImageAttachment(attachment: ChatAttachment): attachment is ImageAttachment {
  if (!attachment?.remoteUrl) {
    return false;
  }
  const mediaType = attachment.mediaType?.toLowerCase?.();
  return typeof mediaType === "string" && mediaType.startsWith("image/");
}

export default function ChatWindow({
  conversationId,
  onSend,
  messages,
  selfUserId,
  peerName,
  peerStatusText,
  connectionStatus,
}: Props) {
  const [playOpen, setPlayOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setDraft("");
    setExpandedAttachmentIds(new Set());
  }, [conversationId]);

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault?.();
    if (!draft.trim()) {
      return;
    }
    setSending(true);
    try {
      await onSend(draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  function handleEmojiClick(emoji: string) {
    setDraft((prev) => `${prev}${emoji}`);
  }

  function toggleAttachment(attachmentId: string) {
    setExpandedAttachmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(attachmentId)) {
        next.delete(attachmentId);
      } else {
        next.add(attachmentId);
      }
      return next;
    });
  }

  const otherLabel = useMemo(() => {
    if (peerName && peerName.trim()) return peerName.trim();
    return messages.find((message) => message.senderId !== selfUserId)?.senderId?.slice(0, 24) ?? "Friend";
  }, [messages, peerName, selfUserId]);
  const statusLabel = peerStatusText ?? "Online";
  const reconnecting = connectionStatus === "reconnecting" || connectionStatus === "connecting";
  const disconnected = connectionStatus === "disconnected";

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200/60 bg-white/70 backdrop-blur">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b bg-white/70 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-300/60">
            <span className="absolute inset-0 grid place-content-center text-slate-500">👤</span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{otherLabel}</div>
            <div className="truncate text-xs text-slate-500">{statusLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <button
            type="button"
            className="grid h-9 w-9 place-content-center rounded-full hover:bg-slate-100"
            aria-label="Search in conversation"
            title="Search"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-content-center rounded-full hover:bg-slate-100"
            aria-label="More options"
            title="More"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-content-center rounded-full hover:bg-slate-100"
            aria-label="Start activity"
            title="Play"
            onClick={() => setPlayOpen(true)}
          >
            🎮
          </button>
        </div>
      </header>

      {reconnecting ? (
        <div className="rounded-none border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-700" role="status" aria-live="polite">
          Reconnecting…
        </div>
      ) : null}
      {disconnected ? (
        <div className="rounded-none border-b border-rose-200 bg-rose-50 px-4 py-2 text-center text-xs text-rose-700" role="alert" aria-live="assertive">
          Connection lost. Messages will send when we reconnect.
        </div>
      ) : null}
      <div
        className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="Chat history"
      >
        {messages.length === 0 ? (
          <p className="py-24 text-center text-sm text-slate-500">Start the conversation with a friendly hello 👋</p>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.senderId === selfUserId;
            const key = msg.messageId || `${msg.clientMsgId}-pending`;
            const createdAt = new Date(msg.createdAt);
            const body = msg.body?.trim() ?? "";
            const hasBody = body.length > 0;
            const imageAttachments = msg.attachments.filter(isRenderableImageAttachment);
            const bubbleClass = clsx(
              "group relative max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm transition",
              isSelf ? "ml-auto bg-sky-500 text-white" : "mr-auto bg-white text-slate-900 ring-1 ring-slate-200",
            );
            const metaRowClass = clsx(
              "mt-1 flex items-center gap-2 text-xs text-slate-500",
              isSelf ? "justify-end" : "justify-start",
            );
            return (
              <div key={key} className={clsx("flex flex-col", isSelf ? "items-end" : "items-start")}>
                <div className={bubbleClass}>
                  {hasBody ? <span className="whitespace-pre-wrap break-words leading-relaxed">{body}</span> : null}
                  {imageAttachments.length ? (
                    <div className={clsx(hasBody ? "mt-2" : undefined, "space-y-2")}>
                      {imageAttachments.map((attachment) => {
                        const isExpanded = expandedAttachmentIds.has(attachment.attachmentId);
                        const label = attachment.fileName ?? "Shared image";
                        const ariaExpanded = isExpanded ? { "aria-expanded": "true" as const } : { "aria-expanded": "false" as const };
                        return (
                          <button
                            key={attachment.attachmentId}
                            type="button"
                            className="block overflow-hidden rounded-xl ring-1 ring-slate-200/70 hover:brightness-105"
                            onClick={() => toggleAttachment(attachment.attachmentId)}
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} image ${label}`}
                            {...ariaExpanded}
                          >
                            <Image
                              src={attachment.remoteUrl}
                              alt={label}
                              width={720}
                              height={720}
                              className={clsx(
                                "h-auto w-full max-w-[420px] object-cover",
                                isExpanded ? "max-h-[480px]" : "max-h-[220px]",
                              )}
                              unoptimized
                              loading="lazy"
                            />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="pointer-events-none hidden justify-center group-hover:flex">
                    <div className="pointer-events-auto inline-flex gap-1 rounded-full bg-white/90 px-2 py-1 text-base shadow ring-1 ring-slate-200">
                      {[
                        { emoji: "👍", label: "React thumbs up" },
                        { emoji: "❤️", label: "React heart" },
                        { emoji: "😂", label: "React laugh" },
                      ].map(({ emoji, label }) => (
                        <button
                          key={emoji}
                          type="button"
                          className="rounded-full px-1 hover:bg-slate-100"
                          aria-label={label}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={metaRowClass}>
                  <time dateTime={createdAt.toISOString()} suppressHydrationWarning>
                    {timeFormatter.format(createdAt)}
                  </time>
                  {isSelf ? <span className="text-slate-400">• Read</span> : null}
                  {!isSelf ? (
                    <ReportUI kind="message" targetId={msg.messageId} className="ml-1" />
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t bg-white/80 px-3 pb-3 pt-2 backdrop-blur" aria-label="Message composer">
        <div className="mb-2 flex items-center gap-1">
          <button
            type="button"
            className="grid h-9 w-9 place-content-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            aria-label="Add attachment"
            title="Add"
          >
            +
          </button>
          <div className="flex flex-wrap items-center gap-1" aria-label="Quick emoji">
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="h-9 rounded-full border border-slate-200 bg-slate-50 px-2 text-lg leading-none transition hover:bg-slate-100"
                onClick={() => handleEmojiClick(emoji)}
                disabled={sending}
                aria-label={`Insert emoji ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            className={clsx(
              "h-12 w-full resize-none rounded-full border border-slate-300 px-4 py-3 text-sm shadow-sm",
              "focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200",
            )}
            placeholder="Type a message"
            disabled={sending}
          />
          <button
            type="button"
            className="grid h-11 w-11 place-content-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Voice note (coming soon)"
            title="Voice"
          >
            🎙️
          </button>
          <button
            type="submit"
            className="h-11 rounded-full bg-sky-600 px-5 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300"
            disabled={sending || !draft.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>

        <div className="mt-1 flex justify-between text-[11px] leading-none text-slate-400">
          <span>Shift+Enter for newline</span>
          <button type="button" className="rounded-full px-2 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-50" onClick={() => setPlayOpen(true)}>Play duel</button>
        </div>
      </form>
      {playOpen && !activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <ChooseActivityModal peerUserId={peerName || 'peer'} onStarted={(sid) => { setActiveSession(sid); setPlayOpen(false); }} />
        </div>
      )}
      {activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="rounded-3xl bg-white p-6 shadow-xl w-full max-w-4xl">
            <LiveSessionShell sessionId={activeSession} opponentUserId={peerName || 'peer'} onEnded={() => setActiveSession(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
