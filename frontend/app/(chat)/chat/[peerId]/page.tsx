"This directory and file have been removed to resolve casing conflicts. Please use [peerid] instead."
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useChatRosterContext } from "@/components/chat/chat-roster-context";
import ChatWindow, { ChatDisplayMessage, MessageStatus } from "@/components/ChatWindow";
import { usePresenceForUser } from "@/hooks/presence/use-presence";
import { ChatMessage, initChatSocket, newClientMessageId, onDelivered, onMessage } from "@/lib/chat";
import { getBackendUrl, getDemoCampusId, getDemoUserId, isDevApiProxyEnabled } from "@/lib/env";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";

type Props = {
  params: { peerId?: string; peerid?: string };
};

const BACKEND_URL = getBackendUrl();
const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

function mapApiMessage(raw: unknown): ChatMessage {
  if (typeof raw !== "object" || raw === null) {
    return {
      messageId: newClientMessageId(),
      clientMsgId: newClientMessageId(),
      seq: 0,
      conversationId: "",
      senderId: "",
      recipientId: "",
      body: "",
      attachments: [],
      createdAt: new Date().toISOString(),
    };
  }
  const data = raw as Record<string, unknown>;
  const attachments = Array.isArray(data.attachments)
    ? data.attachments
        .map((entry) => {
          if (typeof entry !== "object" || entry === null) {
            return null;
          }
          const raw = entry as Record<string, unknown>;
          const attachmentId = typeof raw.attachment_id === "string" ? raw.attachment_id : newClientMessageId();
          const mediaType = typeof raw.media_type === "string" ? raw.media_type : "application/octet-stream";
          const sizeBytes = typeof raw.size_bytes === "number" ? raw.size_bytes : undefined;
          const fileName = typeof raw.file_name === "string" ? raw.file_name : undefined;
          const remoteUrl = typeof raw.remote_url === "string" ? raw.remote_url : undefined;
          const att: ChatMessage["attachments"][number] = {
            attachmentId,
            mediaType,
            sizeBytes,
            fileName,
            remoteUrl,
          };
          return att;
        })
        .filter((entry): entry is ChatMessage["attachments"][number] => entry !== null)
    : [];
  return {
    messageId: typeof data.message_id === "string" ? data.message_id : newClientMessageId(),
    clientMsgId: typeof data.client_msg_id === "string" ? data.client_msg_id : newClientMessageId(),
    seq: typeof data.seq === "number" ? data.seq : Number(data.seq) || 0,
    conversationId: typeof data.conversation_id === "string" ? data.conversation_id : "",
    senderId: typeof data.sender_id === "string" ? data.sender_id : "",
    recipientId: typeof data.recipient_id === "string" ? data.recipient_id : "",
    body: typeof data.body === "string" ? data.body : "",
    attachments,
    createdAt:
      typeof data.created_at === "string"
        ? data.created_at
        : data.created_at instanceof Date
        ? data.created_at.toISOString()
        : new Date().toISOString(),
  };
}

function belongsToConversation(message: ChatMessage, selfId: string, peerId: string): boolean {
  return [message.senderId, message.recipientId].includes(selfId) && [message.senderId, message.recipientId].includes(peerId);
}

export default function ChatPage({ params }: Props) {
  // Accept either `peerId` (camelCase) or `peerid` (lowercase) depending on route folder casing
  const peerId = params.peerId ?? params.peerid ?? "";
  const { entries: rosterEntries } = useChatRosterContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [messageStatuses, setMessageStatuses] = useState<Record<string, MessageStatus>>({});
  const [messageErrors, setMessageErrors] = useState<Record<string, string | null>>({});
  const [loadingHistory, setLoadingHistory] = useState(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingEmitCooldownRef = useRef<number>(0);
  const deliveryAckRef = useRef<{ highestAcked: number; inflight: number | null; queued: number | null }>({
    highestAcked: 0,
    inflight: null,
    queued: null,
  });

  const currentUserId = authUser?.userId ?? DEMO_USER_ID;
  const currentCampusId = authUser?.campusId ?? DEMO_CAMPUS_ID;
  const conversationId = useMemo(() => {
    const participants = [currentUserId, peerId].sort();
    return `chat:${participants[0]}:${participants[1]}`;
  }, [currentUserId, peerId]);
  const presence = usePresenceForUser(peerId);
  const friendPresence = presence
    ? {
        online: presence.online,
        lastSeen: presence.lastSeen ?? null,
      }
    : null;
  const rosterFriend = useMemo(() => rosterEntries.find((entry) => entry.peerId === peerId), [peerId, rosterEntries]);
  const [friendLabel, setFriendLabel] = useState(() => {
    const display = rosterFriend?.displayName?.trim();
    if (display) {
      return display;
    }
    const rawHandle = rosterFriend?.handle?.trim();
    const normalizedHandle = rawHandle?.startsWith("@") ? rawHandle.slice(1) : rawHandle;
    if (normalizedHandle) {
      return normalizedHandle;
    }
    return "Friend";
  });

  useEffect(() => {
    const display = rosterFriend?.displayName?.trim();
    const rawHandle = rosterFriend?.handle?.trim();
    const normalizedHandle = rawHandle?.startsWith("@") ? rawHandle.slice(1) : rawHandle;
    const next = display || normalizedHandle || "Friend";
    setFriendLabel((prev) => (prev === next ? prev : next));
  }, [rosterFriend?.displayName, rosterFriend?.handle, peerId]);

  const friendHandle = useMemo(() => {
    const handle = rosterFriend?.handle?.trim();
    if (!handle) {
      return null;
    }
    return handle.startsWith("@") ? handle.slice(1) : handle;
  }, [rosterFriend?.handle]);

  const ackDelivered = useCallback(
    (targetSeq: number) => {
      if (!peerId || !currentUserId || !currentCampusId || targetSeq <= 0) {
        return;
      }
      const state = deliveryAckRef.current;
      if (targetSeq <= state.highestAcked) {
        return;
      }
      if (state.inflight !== null) {
        state.queued = Math.max(state.queued ?? 0, targetSeq);
        return;
      }
      const send = async (seq: number) => {
        state.inflight = seq;
        try {
          const devProxy = typeof window !== "undefined" && isDevApiProxyEnabled();
          const base = devProxy ? "" : BACKEND_URL;
          const response = await fetch(`${base}/chat/conversations/${peerId}/deliveries`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "X-User-Id": currentUserId,
              ...(currentCampusId ? { "X-Campus-Id": currentCampusId } : {}),
            },
            body: JSON.stringify({ delivered_seq: seq }),
          });
          if (!response.ok) {
            throw new Error(`Failed to acknowledge delivery (${response.status})`);
          }
          let deliveredSeq = seq;
          try {
            const data = await response.json();
            if (typeof data === 'object' && data && typeof data.delivered_seq === 'number') {
              deliveredSeq = data.delivered_seq;
            }
          } catch {
            // ignore JSON parse errors, fallback to seq
          }
          state.highestAcked = Math.max(state.highestAcked, deliveredSeq);
        } catch (error) {
          console.error("Failed to acknowledge chat delivery", error);
        } finally {
          state.inflight = null;
          const nextSeq = state.queued;
          state.queued = null;
          if (nextSeq && nextSeq > state.highestAcked) {
            void send(nextSeq);
          }
        }
      };

      void send(targetSeq);
    },
    [peerId, currentUserId, currentCampusId],
  );

  useEffect(() => {
    setAuthUser(readAuthUser());
    setHydrated(true);
    const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
    return cleanup;
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!hydrated || !peerId || !currentUserId || !currentCampusId) {
      return;
    }

  const controller = new AbortController();
    const socket = initChatSocket(BACKEND_URL, currentUserId, currentCampusId);
    let cancelled = false;

    setMessages(() => {
      messagesRef.current = [];
      return [];
    });
    setMessageStatuses({});
    setMessageErrors({});
    setTyping(false);
    setLoadingHistory(true);
    deliveryAckRef.current = { highestAcked: 0, inflight: null, queued: null };

    const handleMessage = (message: ChatMessage) => {
      if (!belongsToConversation(message, currentUserId, peerId)) {
        return;
      }
      const key = message.clientMsgId || message.messageId;
      setMessages((prev) => {
        const existing = prev.find(
          (item) => item.messageId === message.messageId || item.clientMsgId === message.clientMsgId,
        );
        let next: ChatMessage[];
        if (existing) {
          next = prev
            .map((item) =>
              item.messageId === existing.messageId || item.clientMsgId === existing.clientMsgId ? message : item,
            )
            .sort((a, b) => a.seq - b.seq);
        } else {
          next = [...prev, message].sort((a, b) => a.seq - b.seq);
        }
        messagesRef.current = next;
        return next;
      });
      if (key) {
        const nextStatus: MessageStatus = message.senderId === currentUserId ? "sent" : "delivered";
        setMessageStatuses((prev) => {
          if (prev[key] === nextStatus) {
            return prev;
          }
          return {
            ...prev,
            [key]: nextStatus,
          };
        });
        if (message.senderId === currentUserId) {
          setMessageErrors((prev) => {
            if (!Object.prototype.hasOwnProperty.call(prev, key)) {
              return prev;
            }
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
      if (message.senderId === peerId) {
        setTyping(false);
        if (message.seq > 0) {
          ackDelivered(message.seq);
        }
      }
    };

    const handleTyping = (payload: { from_user_id?: string; peer_id?: string }) => {
      if (payload?.from_user_id !== peerId || payload?.peer_id !== currentUserId) {
        return;
      }
      setTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(false);
      }, 2500);
    };

    const unsubscribeMessage = onMessage(handleMessage);
    const handleDelivered = (payload: { peerId: string; conversationId: string; deliveredSeq: number }) => {
      if (payload.conversationId !== conversationId) {
        return;
      }
      setMessageStatuses((prev) => {
        let updated = false;
        const next = { ...prev };
        for (const message of messagesRef.current) {
          if (message.senderId === currentUserId && message.seq > 0 && message.seq <= payload.deliveredSeq) {
            const key = message.clientMsgId || message.messageId;
            if (key && next[key] !== "delivered") {
              next[key] = "delivered";
              updated = true;
            }
          }
        }
        return updated ? next : prev;
      });
    };
    const unsubscribeDelivery = onDelivered(handleDelivered);
    socket.on("chat:typing", handleTyping);

    async function loadHistory() {
      try {
        const devProxy = typeof window !== "undefined" && isDevApiProxyEnabled();
        const base = devProxy ? "" : BACKEND_URL;
        const response = await fetch(`${base}/chat/conversations/${peerId}/messages`, {
          headers: {
            "content-type": "application/json",
            "X-User-Id": currentUserId,
            ...(currentCampusId ? { "X-Campus-Id": currentCampusId } : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load chat history (${response.status})`);
        }
        const data = (await response.json()) as { items?: unknown[] };
        const history = (data.items ?? []).map((entry) => mapApiMessage(entry)).sort((a, b) => a.seq - b.seq);
        if (cancelled) {
          return;
        }
        setMessages(() => {
          messagesRef.current = history;
          return history;
        });
        const nextStatuses: Record<string, MessageStatus> = {};
        history.forEach((item) => {
          const key = item.clientMsgId || item.messageId;
          if (key) {
            nextStatuses[key] = item.senderId === currentUserId ? "sent" : "delivered";
          }
        });
        setMessageStatuses(nextStatuses);
        setMessageErrors({});
        const highestPeerSeq = history.reduce((acc, item) => {
          if (item.senderId === peerId && item.seq > acc) {
            return item.seq;
          }
          return acc;
        }, 0);
        if (highestPeerSeq > 0) {
          ackDelivered(highestPeerSeq);
        }
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          console.error("Failed to load chat", error);
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
      controller.abort();
      unsubscribeMessage();
      unsubscribeDelivery();
      socket.off("chat:typing", handleTyping);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [hydrated, peerId, currentUserId, currentCampusId, ackDelivered, conversationId]);

  const handleSend = useCallback(
    async (body: string) => {
      const clientMsgId = newClientMessageId();
      const optimisticSeq = messagesRef.current.length > 0 ? messagesRef.current[messagesRef.current.length - 1].seq + 1 : 1;
      const optimisticMessage: ChatMessage = {
        messageId: clientMsgId,
        clientMsgId,
        seq: optimisticSeq,
        conversationId,
        senderId: currentUserId,
        recipientId: peerId,
        body,
        attachments: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, optimisticMessage];
        messagesRef.current = next;
        return next;
      });
      const optimisticKey = optimisticMessage.clientMsgId || optimisticMessage.messageId || clientMsgId;
      setMessageStatuses((prev) => ({
        ...prev,
        [optimisticKey]: "sending",
      }));
      setMessageErrors((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, optimisticKey)) {
          return prev;
        }
        const next = { ...prev };
        delete next[optimisticKey];
        return next;
      });

      const payload = {
        to_user_id: peerId,
        body,
        client_msg_id: clientMsgId,
      };
      try {
        const devProxy = typeof window !== "undefined" && isDevApiProxyEnabled();
        const base = devProxy ? "" : BACKEND_URL;
        const response = await fetch(`${base}/chat/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-User-Id": currentUserId,
            ...(currentCampusId ? { "X-Campus-Id": currentCampusId } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`Failed to send message (${response.status})`);
        }
        setMessageStatuses((prev) => {
          const current = prev[clientMsgId];
          if (current === "delivered" || current === "sent") {
            return prev;
          }
          return {
            ...prev,
            [clientMsgId]: "sent",
          };
        });
        setMessageErrors((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, clientMsgId)) {
            return prev;
          }
          const next = { ...prev };
          delete next[clientMsgId];
          return next;
        });
      } catch (error) {
        console.error("Failed to send chat message", error);
        const messageError = error instanceof Error ? error.message : "Failed to send message";
        setMessageStatuses((prev) => ({
          ...prev,
          [clientMsgId]: "error",
        }));
        setMessageErrors((prev) => ({
          ...prev,
          [clientMsgId]: messageError,
        }));
      }
    },
    [peerId, currentUserId, currentCampusId, conversationId],
  );

  const emitTyping = useCallback(() => {
    if (!peerId || !currentUserId || !currentCampusId) {
      return;
    }
    const now = Date.now();
    if (now - typingEmitCooldownRef.current < 1200) {
      return;
    }
    typingEmitCooldownRef.current = now;
    const socket = initChatSocket(BACKEND_URL, currentUserId, currentCampusId);
    socket.emit("typing", { peer_id: peerId });
  }, [peerId, currentUserId, currentCampusId]);

  const displayMessages = useMemo<ChatDisplayMessage[]>(() => {
    return messages.map((message) => {
      const key = message.clientMsgId || message.messageId;
      const status = messageStatuses[key] ?? (message.senderId === currentUserId ? "sent" : "delivered");
      return {
        ...message,
        status,
        isOwn: message.senderId === currentUserId,
        error: messageErrors[key] ?? null,
      };
    });
  }, [messages, messageStatuses, messageErrors, currentUserId]);

  return (
    <div className="flex h-full flex-1 flex-col">
      <ChatWindow
        conversationId={conversationId}
        friendName={friendLabel}
        friendHandle={friendHandle}
        friendPresence={friendPresence}
        messages={displayMessages}
        onSend={handleSend}
        onTyping={emitTyping}
        typingLabel={typing ? "Typing..." : null}
        loadingHistory={loadingHistory || !hydrated}
      />
    </div>
  );
}
