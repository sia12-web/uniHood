"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import ChatWindow from "@/components/ChatWindow";
import TypingDots from "@/components/TypingDots";
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
import { getBackendUrl, getDemoCampusId, getDemoUserId } from "@/lib/env";
import { usePresenceForUser } from "@/hooks/presence/use-presence";
import { useAutoLivePresence } from "@/hooks/presence/use-auto-live";
import { useSocketStatus } from "@/app/lib/socket/useStatus";

// 🧠 TODO: Refactor this chat page to look more like a modern messenger.
// - Align messages left/right based on sender
// - Add timestamps and avatars
// - Support real-time updates via socket.io
// - Handle empty state and loading errors gracefully
// - Make it responsive and accessible

type RouteParams = {
  peerId?: string;
  peerid?: string;
};

type Props = {
  params: RouteParams;
};

const SOCKET_BASE_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? getBackendUrl();
const API_BASE_URL = getBackendUrl();
// Self and campus come from auth (fallback to demo values for unauthenticated sessions)

function buildConversationId(selfId: string, peerId: string): string {
  const [a, b] = [selfId, peerId].sort((lhs, rhs) => lhs.localeCompare(rhs));
  return `chat:${a}:${b}`;
}

export default function ChatPage({ params }: Props) {
  const peerId = useMemo(() => params.peerId ?? params.peerid ?? "", [params.peerId, params.peerid]);
  const validPeer = peerId.trim();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const { entries, setActiveConversation, updateConversationSnapshot } = useChatRosterContext();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authSnapshot, setAuthSnapshot] = useState<AuthSnapshot | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [deliveredSeq, setDeliveredSeq] = useState(0);
  const acknowledgedSeqRef = useRef(0);

  // Hydrate auth and subscribe to changes
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

  const selfId = useMemo(() => authUser?.userId ?? getDemoUserId(), [authUser]);
  const campusId = useMemo(() => authUser?.campusId ?? getDemoCampusId(), [authUser]);
  const chatSocketStatus = useSocketStatus(onChatSocketStatus, getChatSocketStatus);
  const conversationId = useMemo(() => {
    if (!selfId || !validPeer) {
      return null;
    }
    return buildConversationId(selfId, validPeer);
  }, [selfId, validPeer]);

  useEffect(() => {
    if (!validPeer) {
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
    if (!authReady || !selfId || !validPeer || !conversationId) {
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
        console.error("Failed to acknowledge delivery", error);
        throw error;
      }
    },
    [authReady, validPeer, buildAuthHeaders],
  );

  const handleSend = useCallback(
    async (rawBody: string) => {
      const trimmed = rawBody.trim();
      if (!trimmed || !validPeer) {
        return;
      }
      if (!authReady) {
        console.warn("Chat send skipped: auth not ready");
        return;
      }
      const clientMsgId = newClientMessageId();
      const optimisticCreatedAt = new Date().toISOString();
      const optimistic: ChatMessage = {
        messageId: clientMsgId,
        clientMsgId,
        seq: Date.now(),
        conversationId: `chat:${selfId}:${validPeer}`,
        senderId: selfId,
        recipientId: validPeer,
        body: trimmed,
        attachments: [],
        createdAt: optimisticCreatedAt,
      };
      setTyping(true);
      addMessages([optimistic]);
      updateConversationSnapshot(validPeer, optimistic);
      try {
        const response = await fetch(`${API_BASE_URL}/chat/messages`, {
          method: "POST",
          headers: buildAuthHeaders({ json: true }),
          body: JSON.stringify({
            to_user_id: validPeer,
            body: trimmed,
            client_msg_id: clientMsgId,
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to send message (${response.status})`);
        }
      } catch (error) {
        // Keep the optimistic bubble visible even if sending fails; rely on socket echo to reconcile later.
        console.error("Failed to send message", error);
      } finally {
        setTyping(false);
      }
    },
    [addMessages, validPeer, updateConversationSnapshot, selfId, authReady, buildAuthHeaders],
  );

  const peerEntry = useMemo(() => entries.find((entry) => entry.peerId === validPeer) ?? null, [entries, validPeer]);
  const peerPresence = usePresenceForUser(validPeer);
  // Ensure we appear online while viewing chat.
  useAutoLivePresence();

  const peerDisplayName = useMemo(() => {
    const name = peerEntry?.displayName?.trim();
    if (name) {
      return name;
    }
    const handle = peerEntry?.handle?.trim();
    if (handle) {
      return handle.startsWith("@") ? handle : `@${handle}`;
    }
    return validPeer;
  }, [peerEntry, validPeer]);

  const peerStatusText = useMemo(() => {
    if (typing) {
      return "Typing…";
    }
    if (!peerPresence) {
      return "Offline";
    }
    if (peerPresence.online) {
      return "Online";
    }
    if (peerPresence.lastSeen) {
      const parsed = new Date(peerPresence.lastSeen);
      if (!Number.isNaN(parsed.getTime())) {
        return `Last seen ${formatDistanceToNow(parsed, { addSuffix: true })}`;
      }
    }
    return "Offline";
  }, [peerPresence, typing]);

  const latestIncomingSeq = useMemo(() => {
    if (!messages.length) {
      return 0;
    }
    return messages.reduce((max, message) => {
      if (message.senderId === validPeer) {
        return Math.max(max, message.seq ?? 0);
      }
      return max;
    }, 0);
  }, [messages, validPeer]);

  useEffect(() => {
    if (!authReady || !validPeer || latestIncomingSeq <= 0) {
      return;
    }
    if (acknowledgedSeqRef.current >= latestIncomingSeq) {
      return;
    }
    const targetSeq = latestIncomingSeq;
    acknowledgedSeqRef.current = targetSeq;
    void acknowledgeDelivery(targetSeq).catch(() => {
      // Allow retry on next update if acknowledgement fails
      if (acknowledgedSeqRef.current === targetSeq) {
        acknowledgedSeqRef.current = targetSeq - 1;
      }
    });
  }, [acknowledgeDelivery, authReady, latestIncomingSeq, validPeer]);

  if (!validPeer) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <p className="text-sm text-slate-500">Conversation unavailable.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Chat with {peerDisplayName}</div>
            <TypingDots active={typing} />
          </div>
          {validPeer ? (
            <Link
              href={`/activities/with/${validPeer}`}
              className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-indigo-500"
              prefetch={false}
            >
              Challenge · Typing Duel
            </Link>
          ) : null}
        </div>
      </div>
      {/** Peer display name for header in ChatWindow */}
      {/** Prefer roster name; fallback to handle */}
      {/** Status shows typing when active */}
      
      {/** Compute display props for ChatWindow */}
      {/** useMemo to avoid recomputing every render */}
      
      <ChatWindow
        conversationId={conversationId ?? buildConversationId(selfId, validPeer)}
        onSend={handleSend}
        messages={messages}
        selfUserId={selfId}
        peerUserId={validPeer}
        peerName={peerDisplayName}
        peerStatusText={peerStatusText}
        connectionStatus={chatSocketStatus}
        deliveredSeq={deliveredSeq}
      />
    </div>
  );
}
