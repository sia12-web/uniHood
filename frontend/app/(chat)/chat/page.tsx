"use client";

import { useEffect, useMemo } from "react";

import ChatConversationView from "@/components/ChatConversationView";
import { useChatRosterContext } from "@/components/chat-roster-context";

export default function ChatOverviewPage() {
  const { entries, loading, setActiveConversation, activePeerId } = useChatRosterContext();

  const preferredEntry = useMemo(() => {
    return entries.find((entry) => !entry.isDemo) ?? entries[0] ?? null;
  }, [entries]);

  useEffect(() => {
    if (activePeerId || !preferredEntry) {
      return;
    }
    setActiveConversation(preferredEntry.peerId);
  }, [activePeerId, preferredEntry, setActiveConversation]);

  if (loading) {
    return null;
  }

  if (!preferredEntry) {
    return null;
  }

  return <ChatConversationView peerId={activePeerId ?? preferredEntry.peerId} />;
}
