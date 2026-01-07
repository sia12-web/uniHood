"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import ChatWindow from "@/components/ChatWindow";
import { useChatRosterContext } from "@/components/chat-roster-context";
import {
  ChatMessage,
  initChatSocket,
  mergeChatMessages,
  newClientMessageId,
  normalizeChatMessages,
  onDelivered,
  onMessage,
  getChatSocketStatus,
  onChatSocketStatus,
  type ChatDeliveryEvent,
} from "@/lib/chat";
import {
  onAuthChange,
  readAuthSnapshot,
  readAuthUser,
  resolveAuthHeaders,
  type AuthSnapshot,
  type AuthUser,
} from "@/lib/auth-storage";
import { getBackendUrl } from "@/lib/env";
import { usePresenceForUser } from "@/hooks/presence/use-presence";
import { useAutoLivePresence } from "@/hooks/presence/use-auto-live";
import { useSocketStatus } from "@/app/lib/socket/useStatus";
import { LevelBadge } from "@/components/xp/LevelBadge";

type Props = {
  peerId: string | null;
};

type ConversationMessage = ChatMessage & {
  status?: "pending" | "failed" | "sent";
  error?: string;
};

const SOCKET_BASE_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? getBackendUrl();
const API_BASE_URL = getBackendUrl();

function buildConversationId(selfId: string, peerId: string): string {
  const [a, b] = [selfId, peerId].sort((lhs, rhs) => lhs.localeCompare(rhs));
  return `chat:${a}:${b}`;
}
export default function ChatConversationView({ peerId }: Props) {
  const validPeer = useMemo(() => peerId?.trim() ?? "", [peerId]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const { entries, setActiveConversation, updateConversationSnapshot } = useChatRosterContext();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authSnapshot, setAuthSnapshot] = useState<AuthSnapshot | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [deliveredSeq, setDeliveredSeq] = useState(0);
  const acknowledgedSeqRef = useRef(0);

  useEffect(() => {
    const hydrateAuth = () => {
      setAuthSnapshot(readAuthSnapshot());
      setAuthUser(readAuthUser());
      setAuthReady(true);
    };
    hydrateAuth();
    const unsubscribe = onAuthChange(hydrateAuth);
    return unsubscribe;
  }, []);

  const selfId = useMemo(() => authUser?.userId ?? null, [authUser]);
  const campusId = useMemo(() => authUser?.campusId ?? null, [authUser]);
  const chatSocketStatus = useSocketStatus(onChatSocketStatus, getChatSocketStatus);
  const conversationId = useMemo(() => {
    if (!selfId || !validPeer) {
      return null;
    }
    return buildConversationId(selfId, validPeer);
  }, [selfId, validPeer]);

  useEffect(() => {
    if (!validPeer) {
      setActiveConversation(null);
      return;
    }
    setActiveConversation(validPeer);
    return () => setActiveConversation(null);
  }, [validPeer, setActiveConversation]);

  const addMessages = useCallback(
    (incoming: ChatMessage[]) => {
      if (!incoming.length) {
        return;
      }
      setMessages((prev) => mergeChatMessages(prev, incoming));
    },
    [],
  );

  const buildAuthHeaders = useCallback(
    (options: { json?: boolean } = {}) => {
      if (!selfId) {
        return {};
      }
      const headerBag = new Headers({
        "X-User-Id": selfId,
        Accept: "application/json",
      });
      if (campusId) {
        headerBag.set("X-Campus-Id", campusId);
      }
      const resolved = resolveAuthHeaders(authSnapshot);
      for (const [key, value] of Object.entries(resolved)) {
        headerBag.set(key, value);
      }
      if (options.json) {
        headerBag.set("Content-Type", "application/json");
      }
      return Object.fromEntries(headerBag.entries());
    },
    [authSnapshot, campusId, selfId],
  );

  useEffect(() => {
    if (!authReady || !selfId || !campusId || !validPeer || !conversationId) {
      return;
    }
    initChatSocket(SOCKET_BASE_URL, selfId, campusId);
    const unsubscribeMessage = onMessage((message) => {
      const isRelevant = message.senderId === validPeer || message.recipientId === validPeer;
      if (isRelevant) {
        addMessages([message]);
        updateConversationSnapshot(validPeer, message);
      }
    });
    const unsubscribeDelivery = onDelivered((payload: ChatDeliveryEvent) => {
      if (!payload || payload.peerId !== validPeer) {
        return;
      }
      if (payload.conversationId && payload.conversationId !== conversationId) {
        return;
      }
      if (payload.source && payload.source !== "ack") {
        return;
      }
      setDeliveredSeq((prev) => Math.max(prev, payload.deliveredSeq ?? 0));
    });

    const abortController = new AbortController();
    setMessages([]);
    setDeliveredSeq(0);
    acknowledgedSeqRef.current = 0;
    fetch(`${API_BASE_URL}/chat/conversations/${validPeer}/messages`, {
      headers: buildAuthHeaders(),
      signal: abortController.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load chat (${res.status})`);
        }
        const payload = await res.json();
        const history = normalizeChatMessages(payload);
        addMessages(history);
        const lastMessage = history.at(-1) ?? null;
        if (lastMessage) {
          updateConversationSnapshot(validPeer, lastMessage);
        }
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error("Failed to load chat", error);
      });
    return () => {
      unsubscribeMessage();
      unsubscribeDelivery();
      abortController.abort();
    };
  }, [validPeer, addMessages, updateConversationSnapshot, selfId, campusId, buildAuthHeaders, authReady, conversationId]);

  const acknowledgeDelivery = useCallback(
    async (seq: number) => {
      if (!authReady || !validPeer || seq <= 0) {
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/chat/conversations/${validPeer}/deliveries`, {
          method: "POST",
          headers: buildAuthHeaders({ json: true }),
          body: JSON.stringify({ delivered_seq: seq }),
        });
        if (!response.ok) {
          throw new Error(`Failed to acknowledge delivery (${response.status})`);
        }
      } catch (error) {
        console.warn("Delivery ack failed", error);
      }
    },
    [authReady, validPeer, buildAuthHeaders],
  );

  useEffect(() => {
    if (!deliveredSeq || deliveredSeq <= acknowledgedSeqRef.current) {
      return;
    }
    acknowledgedSeqRef.current = deliveredSeq;
    void acknowledgeDelivery(deliveredSeq);
  }, [deliveredSeq, acknowledgeDelivery]);

  const handleSend = useCallback(
    async (body: string) => {
      if (!body.trim() || !validPeer || !selfId || !authReady) {
        return;
      }
      const clientMsgId = newClientMessageId();
      const optimisticMessage: ConversationMessage = {
        conversationId: conversationId ?? buildConversationId(selfId, validPeer),
        messageId: clientMsgId,
        seq: 0,
        senderId: selfId,
        recipientId: validPeer,
        body,
        createdAt: new Date().toISOString(),
        clientMsgId,
        status: "pending",
        attachments: [],
      };
      addMessages([optimisticMessage]);
      try {
        const response = await fetch(`${API_BASE_URL}/chat/messages`, {
          method: "POST",
          headers: buildAuthHeaders({ json: true }),
          body: JSON.stringify({
            to_user_id: validPeer,
            body,
            client_msg_id: clientMsgId,
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to send message (${response.status})`);
        }
        const payload = await response.json();
        const normalised = normalizeChatMessages(payload);
        addMessages(normalised);
        const lastMessage = normalised.at(-1) ?? null;
        if (lastMessage) {
          updateConversationSnapshot(validPeer, lastMessage);
        }
      } catch (error) {
        console.error("Send failed", error);
        setMessages((prev) =>
          prev.map((message) =>
            message.clientMsgId === clientMsgId
              ? { ...message, status: "failed", error: "Failed to send" }
              : message,
          ),
        );
      }
    },
    [authReady, validPeer, selfId, addMessages, buildAuthHeaders, conversationId, updateConversationSnapshot],
  );

  const handleSendAudio = useCallback(
    async (body: string, attachments: Array<{ attachmentId: string; mediaType: string; sizeBytes: number; remoteUrl: string }>) => {
      if (!validPeer || !selfId || !authReady) {
        return;
      }
      const clientMsgId = newClientMessageId();

      // Convert to ChatMessage attachment format
      const messageAttachments = attachments.map((att) => ({
        attachmentId: att.attachmentId,
        mediaType: att.mediaType,
        sizeBytes: att.sizeBytes,
        remoteUrl: att.remoteUrl,
      }));

      const optimisticMessage: ConversationMessage = {
        conversationId: conversationId ?? buildConversationId(selfId, validPeer),
        messageId: clientMsgId,
        seq: 0,
        senderId: selfId,
        recipientId: validPeer,
        body,
        createdAt: new Date().toISOString(),
        clientMsgId,
        status: "pending",
        attachments: messageAttachments,
      };
      addMessages([optimisticMessage]);

      try {
        const response = await fetch(`${API_BASE_URL}/chat/messages`, {
          method: "POST",
          headers: buildAuthHeaders({ json: true }),
          body: JSON.stringify({
            to_user_id: validPeer,
            body,
            client_msg_id: clientMsgId,
            attachments: attachments.map((att) => ({
              attachment_id: att.attachmentId,
              media_type: att.mediaType,
              size_bytes: att.sizeBytes,
              remote_url: att.remoteUrl,
            })),
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to send audio message (${response.status})`);
        }
        const payload = await response.json();
        const normalised = normalizeChatMessages(payload);
        addMessages(normalised);
        const lastMessage = normalised.at(-1) ?? null;
        if (lastMessage) {
          updateConversationSnapshot(validPeer, lastMessage);
        }
      } catch (error) {
        console.error("Audio send failed", error);
        setMessages((prev) =>
          prev.map((message) =>
            message.clientMsgId === clientMsgId
              ? { ...message, status: "failed", error: "Failed to send audio" }
              : message,
          ),
        );
      }
    },
    [authReady, validPeer, selfId, addMessages, buildAuthHeaders, conversationId, updateConversationSnapshot],
  );

  const peerEntry = useMemo(
    () => entries.find((entry) => entry.peerId === validPeer),
    [entries, validPeer],
  );
  const presence = usePresenceForUser(validPeer);
  useAutoLivePresence();

  const headerTitle = peerEntry?.displayName ?? validPeer;
  const handle = peerEntry?.handle ? `@${peerEntry.handle}` : null;
  const peersLabel = peerEntry?.isDemo ? "Seeded conversation" : presence?.online ? "Online now" : "Away";

  if (!validPeer) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-10 text-center text-sm text-navy/60 dark:text-slate-400">
        <p>Select a friend on the left to start chatting.</p>
      </div>
    );
  }

  const socketStatusLabel = chatSocketStatus === "connected" ? "Connected" : "Connecting…";

  return (
    <div className="w-full px-3 py-4 sm:px-4">
      <div className="mx-auto flex h-[78vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-100 p-1 md:p-3.5">
        <header className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
          <Link
            href={`/socials?tab=discover&user=${validPeer}`}
            className="group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-midnight/10 dark:bg-indigo-500/20 text-base font-semibold text-midnight dark:text-indigo-300 transition-all hover:scale-105 active:scale-95"
          >
            {peerEntry?.displayName?.charAt(0).toUpperCase() ?? validPeer.slice(0, 1).toUpperCase()}
            <div className="absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-indigo-500/20 transition-all" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/socials?tab=discover&user=${validPeer}`} className="group flex items-center gap-2 w-fit">
              <p className="truncate text-xl font-semibold text-midnight dark:text-slate-100 group-hover:text-indigo-600 transition-colors">{headerTitle}</p>
              {peerEntry?.level ? <LevelBadge level={peerEntry.level} size="sm" /> : null}
            </Link>
          </div>
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            {socketStatusLabel}
          </span>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden px-1 pb-2 pt-3">
          <ChatWindow
            conversationId={(conversationId ?? (selfId && validPeer ? buildConversationId(selfId, validPeer) : ""))}
            messages={messages}
            selfUserId={selfId ?? ""}
            peerUserId={validPeer}
            peerName={headerTitle}
            peerStatusText={handle ?? peersLabel}
            connectionStatus={chatSocketStatus}
            deliveredSeq={deliveredSeq}
            onSend={handleSend}
            onSendAudio={handleSendAudio}
          />
        </div>

        <footer className="mt-2 flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2 text-[10px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
            <span>Live delivery enabled</span>
          </div>
          <Link href="/friends" className="font-semibold text-midnight dark:text-indigo-400 underline-offset-4 hover:underline">
            Add more friends
          </Link>
        </footer>
      </div>
    </div>
  );
}
