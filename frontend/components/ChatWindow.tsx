"use client";

import clsx from "clsx";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Smile, Gamepad2 } from "lucide-react";

import type { SocketConnectionStatus } from "@/app/lib/socket/base";

import { useTypingDuelInvite } from "@/hooks/activities/use-typing-duel-invite";

import type { ChatMessage } from "../lib/chat";
import { ChooseActivityModal } from "../app/features/activities/components/ChooseActivityModal";
import { GameInviteCard, isGameInviteMessage } from "./GameInviteCard";

type AudioAttachment = {
  attachmentId: string;
  mediaType: string;
  sizeBytes: number;
  remoteUrl: string; // base64 data URL for audio
};

type Props = {
  conversationId: string;
  onSend: (body: string) => Promise<void>;
  onSendAudio?: (body: string, attachments: AudioAttachment[]) => Promise<void>;
  messages: ChatMessage[];
  selfUserId: string;
  peerUserId: string;
  peerName?: string | null;
  peerStatusText?: string | null;
  connectionStatus?: SocketConnectionStatus;
  deliveredSeq?: number;
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

type AudioAttachmentType = ChatAttachment & { remoteUrl: string };

function isRenderableAudioAttachment(attachment: ChatAttachment): attachment is AudioAttachmentType {
  if (!attachment?.remoteUrl) {
    return false;
  }
  const mediaType = attachment.mediaType?.toLowerCase?.();
  return typeof mediaType === "string" && mediaType.startsWith("audio/");
}

// Helper function to convert Blob to base64 data URL - REMOVED


export default function ChatWindow({
  conversationId,
  onSend,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSendAudio,
  messages,
  selfUserId,
  peerUserId,
  peerName,
  peerStatusText,
  connectionStatus,
  deliveredSeq,
}: Props) {
  const [playOpen, setPlayOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { invite, acknowledge } = useTypingDuelInvite({ peerUserId });

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    [],
  );

  useEffect(() => {
    if (!invite) {
      return;
    }
    // Acknowledge the invite - user will click the link in chat instead
    acknowledge(invite.sessionId);
  }, [acknowledge, invite]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setDraft("");
  }, [conversationId]);



  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault?.();
    if (!draft.trim()) {
      inputRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      await onSend(draft.trim());
      setDraft("");
    } finally {
      setSending(false);
      // Use setTimeout to ensure the focus happens after the re-enable
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }

  function handleEmojiClick(emoji: string) {
    setDraft((prev) => `${prev}${emoji}`);
    setShowEmojiPicker(false);
  }



  const reconnecting = connectionStatus === "reconnecting";
  const disconnected = connectionStatus === "disconnected";

  // Group messages logic
  const groupedMessages = useMemo(() => {
    const groups: { isSelf: boolean; senderId: string; messages: ChatMessage[]; id: string }[] = [];
    let currentGroup: { isSelf: boolean; senderId: string; messages: ChatMessage[]; id: string } | null = null;

    messages.forEach((msg) => {
      const isSelf = msg.senderId === selfUserId;
      // Group if same sender and within 2 minutes
      const msgTime = new Date(msg.createdAt).getTime();
      const prevTime = currentGroup?.messages[currentGroup.messages.length - 1]
        ? new Date(currentGroup.messages[currentGroup.messages.length - 1].createdAt).getTime()
        : 0;

      const isRecent = currentGroup && (msgTime - prevTime < 2 * 60 * 1000);

      if (currentGroup && currentGroup.isSelf === isSelf && isRecent) {
        currentGroup.messages.push(msg);
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          isSelf,
          senderId: msg.senderId,
          messages: [msg],
          id: msg.messageId || msg.clientMsgId || `temp-${Date.now()}`
        };
      }
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [messages, selfUserId]);

  return (
    <div
      className="relative flex h-full w-full flex-1 min-h-0 flex-col bg-slate-50 text-sm overflow-hidden"
      aria-label={`Conversation with ${peerName ?? "friend"}${peerStatusText ? ` (${peerStatusText})` : ""}`}
    >

      {/* Connection Status */}
      <AnimatePresence>
        {reconnecting && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-50 px-6 py-2 text-center text-xs font-semibold text-amber-700"
          >
            Reconnecting…
          </motion.div>
        )}
        {disconnected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-rose-50 px-6 py-2 text-center text-xs font-semibold text-rose-700"
          >
            Connection lost. Messages will send when we reconnect.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-6 md:px-8 scroll-smooth"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center opacity-60">
            <div className="h-24 w-24 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
              <span className="text-4xl">👋</span>
            </div>
            <p className="text-slate-500 font-medium">No messages yet</p>
            <p className="text-slate-400 text-xs mt-1">Start the conversation with a friendly hello!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedMessages.map((group) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx("flex flex-col", group.isSelf ? "items-end" : "items-start")}
              >
                <div className={clsx("flex flex-col gap-1 max-w-[85%] md:max-w-[70%]", group.isSelf ? "items-end" : "items-start")}>
                  {group.messages.map((msg, i) => {
                    const isFirst = i === 0;
                    const isLast = i === group.messages.length - 1;
                    const body = msg.body?.trim() ?? "";
                    const hasBody = body.length > 0;
                    const imageAttachments = msg.attachments.filter(isRenderableImageAttachment);
                    const audioAttachments = msg.attachments.filter(isRenderableAudioAttachment);

                    return (
                      <div
                        key={msg.messageId || msg.clientMsgId}
                        className={clsx(
                          "relative px-5 py-3 text-[15px] leading-relaxed shadow-sm transition-all hover:shadow-md",
                          group.isSelf
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-slate-800 border border-slate-100",
                          // Border Radius Logic
                          isFirst && isLast ? "rounded-2xl" :
                            isFirst && group.isSelf ? "rounded-2xl rounded-br-sm" :
                              isFirst && !group.isSelf ? "rounded-2xl rounded-bl-sm" :
                                isLast && group.isSelf ? "rounded-2xl rounded-tr-sm" :
                                  isLast && !group.isSelf ? "rounded-2xl rounded-tl-sm" :
                                    group.isSelf ? "rounded-l-2xl rounded-r-sm" : "rounded-r-2xl rounded-l-sm"
                        )}
                      >
                        {isGameInviteMessage(body) ? (
                          <GameInviteCard body={body} isSelf={group.isSelf} />
                        ) : (
                          <>
                            {hasBody && <span className="whitespace-pre-wrap break-words">{body}</span>}
                          </>
                        )}

                        {/* Audio attachments (voice messages) */}
                        {audioAttachments.length > 0 && (
                          <div className={clsx(hasBody ? "mt-3" : "", "space-y-2")}>
                            {audioAttachments.map((attachment) => (
                              <div key={attachment.attachmentId} className="flex items-center gap-2">
                                <audio
                                  src={attachment.remoteUrl}
                                  controls
                                  className={clsx(
                                    "h-10 w-full max-w-[250px] rounded-lg",
                                    group.isSelf
                                      ? "[&::-webkit-media-controls-panel]:bg-indigo-500"
                                      : "[&::-webkit-media-controls-panel]:bg-slate-100"
                                  )}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {imageAttachments.length > 0 && (
                          <div className={clsx(hasBody ? "mt-3" : "", "space-y-2")}>
                            {imageAttachments.map((attachment) => (
                              <div key={attachment.attachmentId} className="overflow-hidden rounded-lg">
                                <Image
                                  src={attachment.remoteUrl}
                                  alt="Attachment"
                                  width={400}
                                  height={300}
                                  className="w-full h-auto object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Meta info for the group (timestamp + status) */}
                <div className={clsx("mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 px-1", group.isSelf ? "justify-end" : "justify-start")}>
                  <span>{timeFormatter.format(new Date(group.messages[group.messages.length - 1].createdAt))}</span>
                  {group.isSelf && (
                    <>
                      <span>•</span>
                      <span>
                        {group.messages.some(m => m.messageId === m.clientMsgId) ? "Sending..." :
                          (deliveredSeq && deliveredSeq >= (group.messages[group.messages.length - 1].seq ?? 0)) ? "Read" : "Sent"}
                      </span>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="p-4 md:p-6 bg-white/80 backdrop-blur-sm border-t border-slate-100 relative">
        {showEmojiPicker && (
          <div className="absolute bottom-full mb-2 left-4 bg-white shadow-xl rounded-2xl p-3 grid grid-cols-6 gap-2 border border-slate-100 z-50 animate-in fade-in slide-in-from-bottom-2">
            {QUICK_EMOJI.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className="text-2xl hover:bg-slate-50 p-2 rounded-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="relative flex items-end gap-2 rounded-[28px] bg-slate-50 p-2 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:bg-white transition-all shadow-sm"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            className="max-h-32 min-h-[44px] w-full resize-none bg-transparent py-3 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            placeholder="Type a message..."
            disabled={sending}
            rows={1}
          />

          <div className="flex items-center gap-1 pb-1">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                showEmojiPicker ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              )}
            >
              <Smile className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setPlayOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              title="Invite to play a game"
            >
              <Gamepad2 className="h-5 w-5" />
            </button>
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <Send className="h-4 w-4 ml-0.5" />
            </button>
          </div>
        </form>

        <div className="mt-2 flex justify-center">
          <p className="text-[10px] text-slate-400 font-medium">Press Enter to send • Shift+Enter for new line</p>
        </div>
      </div>

      {playOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setPlayOpen(false); }}
        >
          <ChooseActivityModal
            peerUserId={peerUserId}
            onSendMessage={async (message) => { await onSend(message); setPlayOpen(false); }}
            onClose={() => setPlayOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
