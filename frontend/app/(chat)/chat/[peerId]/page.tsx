"use client";

import ChatConversationView from "@/components/ChatConversationView";

type RouteParams = {
  peerId?: string;
  peerid?: string;
};

export default function ChatConversationPage({ params }: { params: RouteParams }) {
  const peerId = params.peerId ?? params.peerid ?? null;
  return <ChatConversationView peerId={peerId} />;
}
