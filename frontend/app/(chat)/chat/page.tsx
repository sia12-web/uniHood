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
    return (
      <div className="flex h-full items-center justify-center px-8 py-10 text-sm text-navy/60">
        Loading chats...
      </div>
    );
  }

  if (!preferredEntry) {
    return (
      <div className="flex h-full items-center justify-center px-8 py-10 text-sm text-navy/60">
        Start the conversation by inviting a classmate from the Friends tab.
      </div>
    );
  }

  return <ChatConversationView peerId={activePeerId ?? preferredEntry.peerId} />;
}
