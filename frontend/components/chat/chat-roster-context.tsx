"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ChatRosterEntry } from "@/hooks/chat/use-chat-roster";

export type ChatRosterContextValue = {
  entries: ChatRosterEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const ChatRosterContext = createContext<ChatRosterContextValue | null>(null);

export function ChatRosterProvider({ value, children }: { value: ChatRosterContextValue; children: ReactNode }) {
  return <ChatRosterContext.Provider value={value}>{children}</ChatRosterContext.Provider>;
}

export function useChatRosterContext(): ChatRosterContextValue {
  const context = useContext(ChatRosterContext);
  if (!context) {
    throw new Error("useChatRosterContext must be used within a ChatRosterProvider");
  }
  return context;
}
