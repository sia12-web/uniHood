"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import { ActivitiesQuickCard } from "@/app/features/activities/components/ActivitiesQuickCard";

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
      <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
        <ActivitiesQuickCard variant="chat" className="w-full max-w-md" />
      </div>
    );
  }

  const EmptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 py-10 text-center text-sm text-navy/60">
      <p>Add or accept a friend to start your first conversation.</p>
      <ActivitiesQuickCard variant="chat" className="w-full max-w-md text-left" />
    </div>
  );

  if (entries.length === 0) {
    return EmptyState;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 py-10 text-center text-sm text-navy/60">
      <p>Choose a contact from the list to continue chatting in real time.</p>
      <ActivitiesQuickCard variant="chat" className="w-full max-w-md text-left" />
    </div>
  );
}
