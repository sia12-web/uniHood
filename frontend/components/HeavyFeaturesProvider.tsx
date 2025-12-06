"use client";

/**
 * Heavy Features Provider
 * 
 * This component wraps the heavy initialization of chat, presence, and social hooks.
 * It's designed to be dynamically imported with ssr: false to reduce initial bundle
 * and defer main thread blocking.
 * 
 * Usage in page.tsx:
 *   const HeavyFeatures = dynamic(() => import("@/components/HeavyFeaturesProvider"), { ssr: false });
 *   <HeavyFeatures onStateChange={setHeavyState} />
 */

import { useEffect, useRef } from "react";

import { useChatUnreadIndicator } from "@/hooks/chat/use-chat-unread-indicator";
import { useChatRoster } from "@/hooks/chat/use-chat-roster";
import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";
import { useInviteInboxCount } from "@/hooks/social/use-invite-count";

export type HeavyFeaturesState = {
  chatRoster: ReturnType<typeof useChatRoster> | null;
  chatUnread: ReturnType<typeof useChatUnreadIndicator> | null;
  friendAcceptance: ReturnType<typeof useFriendAcceptanceIndicator> | null;
  inviteCount: ReturnType<typeof useInviteInboxCount> | null;
  loaded: boolean;
};

type HeavyFeaturesProviderProps = {
  onStateChange?: (state: HeavyFeaturesState) => void;
};

export default function HeavyFeaturesProvider({
  onStateChange,
}: HeavyFeaturesProviderProps) {
  // Initialize all heavy hooks (they manage auth internally)
  const chatRoster = useChatRoster();
  const chatUnread = useChatUnreadIndicator();
  const friendAcceptance = useFriendAcceptanceIndicator();
  const inviteCount = useInviteInboxCount();
  
  const prevStateRef = useRef<HeavyFeaturesState | null>(null);
  
  // Report state changes back to parent
  useEffect(() => {
    const newState: HeavyFeaturesState = {
      chatRoster,
      chatUnread,
      friendAcceptance,
      inviteCount,
      loaded: true,
    };
    
    // Only call onStateChange if the state actually changed
    // Use shallow comparison of key values
    const prev = prevStateRef.current;
    const hasChanged = !prev || 
      prev.chatRoster !== chatRoster ||
      prev.chatUnread !== chatUnread ||
      prev.friendAcceptance !== friendAcceptance ||
      prev.inviteCount !== inviteCount;
    
    if (hasChanged) {
      prevStateRef.current = newState;
      onStateChange?.(newState);
    }
  }, [chatRoster, chatUnread, friendAcceptance, inviteCount, onStateChange]);
  
  // This component renders nothing - it's purely for side effects
  return null;
}

// Export initial state helper for parent components
export function getInitialHeavyState(): HeavyFeaturesState {
  return {
    chatRoster: null,
    chatUnread: null,
    friendAcceptance: null,
    inviteCount: null,
    loaded: false,
  };
}
