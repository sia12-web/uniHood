"use client";

import { useEffect, useState } from "react";

import ChatWindow from "@/components/ChatWindow";
import TypingDots from "@/components/TypingDots";
import { ChatMessage, initChatSocket, newClientMessageId, onDelivered, onMessage } from "@/lib/chat";

type Props = {
  params: { peerId: string };
};

const SOCKET_BASE_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:8000";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SELF_ID = "11111111-1111-1111-1111-111111111111"; // replace with real auth integration
const CAMPUS_ID = "00000000-0000-0000-0000-000000000000";

export default function ChatPage({ params }: Props) {
  const { peerId } = params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const socket = initChatSocket(SOCKET_BASE_URL, SELF_ID, CAMPUS_ID);
    const unsubscribeMessage = onMessage((message) => {
      if (message.conversationId.includes(peerId)) {
        setMessages((prev) => [...prev, message]);
      }
    });
    const unsubscribeDelivery = onDelivered(({ deliveredSeq }) => {
      console.debug("Delivered up to", deliveredSeq);
    });

    fetch(`${API_BASE_URL}/chat/conversations/${peerId}/messages`, {
      headers: {
        "content-type": "application/json",
        "X-User-Id": SELF_ID,
        "X-Campus-Id": CAMPUS_ID,
      },
    })
      .then((res) => res.json())
      .then((data) => setMessages(data.items ?? []))
      .catch((error) => console.error("Failed to load chat", error));
    return () => {
      unsubscribeMessage();
      unsubscribeDelivery();
      socket.off("chat:typing");
    };
  }, [peerId]);

  async function handleSend(body: string) {
    setTyping(true);
    const payload = {
      to_user_id: peerId,
      body,
      client_msg_id: newClientMessageId(),
    };
    await fetch(`${API_BASE_URL}/chat/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-User-Id": SELF_ID,
        "X-Campus-Id": CAMPUS_ID,
      },
      body: JSON.stringify(payload),
    });
    setTyping(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="text-lg font-semibold">Chat with {peerId}</div>
        <TypingDots active={typing} />
      </div>
      <ChatWindow conversationId={`chat:${SELF_ID}:${peerId}`} onSend={handleSend} messages={messages} />
    </div>
  );
}
