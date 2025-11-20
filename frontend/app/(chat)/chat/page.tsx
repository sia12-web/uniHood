"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";


import { useChatRosterContext } from "@/components/chat-roster-context";

export default function ChatOverviewPage() {
  const { entries, loading, setActiveConversation } = useChatRosterContext();
  const router = useRouter();
  const hasNavigatedRef = useRef(false);
  const preferredEntry = useMemo(() => {
    return entries.find((entry) => !entry.isDemo) ?? entries[0] ?? null;
  }, [entries]);

  useEffect(() => {
    setActiveConversation(null);
  }, [setActiveConversation]);

  useEffect(() => {
    if (hasNavigatedRef.current || loading) {
      return;
    }
    if (preferredEntry) {
      hasNavigatedRef.current = true;
      router.replace(`/chat/${preferredEntry.peerId}`);
    }
  }, [loading, preferredEntry, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-8 py-10 text-sm text-navy/60">
        Loading chats…
      </div>
    );
  }

  if (preferredEntry) {
    return (
      <div className="flex h-full items-center justify-center px-8 py-10 text-sm text-navy/60">
        Redirecting to your chat…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 py-10 text-sm text-navy/60">
        Start the conversation by inviting a classmate from the Friends tab.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 py-10 text-center text-sm text-navy/60">
      <p>Choose a contact from the list to continue chatting in real time.</p>
    </div>
  );
}
