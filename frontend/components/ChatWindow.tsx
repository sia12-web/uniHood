"use client";

import clsx from "clsx";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Smile, Search, Phone, Video, X, StopCircle } from "lucide-react";

import type { SocketConnectionStatus } from "@/app/lib/socket/base";

import { ReportUI } from "@/app/features/moderation/ReportButton";
import { useTypingDuelInvite } from "@/hooks/activities/use-typing-duel-invite";

import type { ChatMessage } from "../lib/chat";
import { ChooseActivityModal } from "../app/features/activities/components/ChooseActivityModal";
import { LiveSessionShell } from "../app/features/activities/components/LiveSessionShell";

type Props = {
  conversationId: string;
  onSend: (body: string) => Promise<void>;
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

export default function ChatWindow({
  conversationId,
  onSend,
  messages,
  selfUserId,
  peerUserId,
  peerName,
  peerStatusText,
  connectionStatus,
  deliveredSeq,
}: Props) {
  const [playOpen, setPlayOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<Set<string>>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
    setActiveSession(invite.sessionId);
    setPlayOpen(false);
    acknowledge(invite.sessionId);
  }, [acknowledge, invite]);

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
    setShowEmojiPicker(false);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log("Audio recorded:", audioBlob);
        // TODO: Implement upload and send logic here
        // For now, we just log it as we don't have an upload endpoint ready
        
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setRecordingDuration(0);
      };

      recorder.start();
      setIsRecording(true);
      
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please ensure you have granted permission.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && isRecording) {
      // Stop but don't process
      mediaRecorderRef.current.onstop = null; 
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      setRecordingDuration(0);
    }
  }

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
    <div className="relative flex h-full w-full flex-1 min-h-0 flex-col bg-[#f8f9fc] text-sm overflow-hidden">
      
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
                        {hasBody && <span className="whitespace-pre-wrap break-words">{body}</span>}
                        
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

        {isRecording ? (
          <div className="flex items-center gap-4 rounded-[28px] bg-red-50 p-2 ring-1 ring-red-100 shadow-sm animate-pulse">
            <div className="flex-1 flex items-center gap-3 px-4">
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-600 font-medium font-mono">{formatDuration(recordingDuration)}</span>
              <span className="text-red-400 text-sm">Recording...</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={cancelRecording}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                title="Cancel"
              >
                <X className="h-5 w-5" />
              </button>
              <button
                onClick={stopRecording}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-all"
                title="Send Voice Message"
              >
                <Send className="h-4 w-4 ml-0.5" />
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="relative flex items-end gap-2 rounded-[28px] bg-slate-50 p-2 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:bg-white transition-all shadow-sm"
          >
            <textarea
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
              {draft.trim() ? (
                <button
                  type="submit"
                  disabled={sending}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4 ml-0.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
          </form>
        )}
        
        {!isRecording && (
          <div className="mt-2 flex justify-center">
             <p className="text-[10px] text-slate-400 font-medium">Press Enter to send • Shift+Enter for new line</p>
          </div>
        )}
      </div>

      {playOpen && !activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <ChooseActivityModal peerUserId={peerUserId} onStarted={(sid) => { setActiveSession(sid); setPlayOpen(false); }} />
        </div>
      )}
      {activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="rounded-3xl bg-white p-6 shadow-2xl w-full max-w-5xl h-[80vh] overflow-hidden">
            <LiveSessionShell sessionId={activeSession} opponentUserId={peerName || 'peer'} onEnded={() => setActiveSession(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
