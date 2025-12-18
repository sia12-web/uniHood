"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { useStoryInvite, type StoryInvite } from "@/hooks/activities/use-story-invite";

export type StoryInviteContextValue = {
  hasPending: boolean;
  pendingInvite: StoryInvite | null;
  openLatest: () => void;
  dismissLatest: () => void;
};

const StoryInviteContext = createContext<StoryInviteContextValue | null>(null);

export function useStoryInviteState(): StoryInviteContextValue {
  const context = useContext(StoryInviteContext);
  if (!context) {
    throw new Error("useStoryInviteState must be used within StoryInviteProvider");
  }
  return context;
}

type ProviderProps = {
  children: ReactNode;
};

export function StoryInviteProvider({ children }: ProviderProps) {
  const router = useRouter();
  const { invite, dismiss } = useStoryInvite();
  const [pending, setPending] = useState<StoryInvite | null>(null);
  const lastToastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!invite) {
      return;
    }
    setPending(invite);
    if (lastToastIdRef.current === invite.id) {
      return;
    }
    lastToastIdRef.current = invite.id;
    // Toast notification removed - invites are shown in the story page inbox
  }, [invite]);

  const openLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    router.push("/activities/story?focus=invites");
  }, [pending, router]);

  const dismissLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    dismiss(pending.id);
    setPending(null);
  }, [dismiss, pending]);

  const value = useMemo<StoryInviteContextValue>(() => ({
    hasPending: Boolean(pending),
    pendingInvite: pending,
    openLatest,
    dismissLatest,
  }), [dismissLatest, openLatest, pending]);

  return (
    <StoryInviteContext.Provider value={value}>
      {children}
    </StoryInviteContext.Provider>
  );
}
