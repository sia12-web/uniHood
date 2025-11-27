"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useTypingDuelInvite, type TypingDuelInvite } from "@/hooks/activities/use-typing-duel-invite";
import { useRouter } from "next/navigation";

export type TypingDuelInviteContextValue = {
  hasPending: boolean;
  pendingInvite: TypingDuelInvite | null;
  openLatest: () => void;
  dismissLatest: () => void;
};

const TypingDuelInviteContext = createContext<TypingDuelInviteContextValue | null>(null);

export function useTypingDuelInviteState(): TypingDuelInviteContextValue {
  const context = useContext(TypingDuelInviteContext);
  if (!context) {
    throw new Error("useTypingDuelInviteState must be used within TypingDuelInviteProvider");
  }
  return context;
}

type ProviderProps = {
  children: ReactNode;
};

type InviteBundle = TypingDuelInvite;

export function TypingDuelInviteProvider({ children }: ProviderProps) {
  const router = useRouter();
  const { invite, acknowledge } = useTypingDuelInvite();
  const [pending, setPending] = useState<InviteBundle | null>(null);

  useEffect(() => {
    setPending(invite ?? null);
  }, [invite]);

  const openLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    router.push("/activities/speed_typing?focus=invites");
  }, [pending, router]);

  const dismissLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    acknowledge(pending.sessionId);
    setPending(null);
  }, [acknowledge, pending]);

  const contextValue = useMemo<TypingDuelInviteContextValue>(() => {
    return {
      hasPending: Boolean(pending),
      pendingInvite: pending,
      openLatest,
      dismissLatest,
    };
  }, [dismissLatest, openLatest, pending]);

  return (
    <TypingDuelInviteContext.Provider value={contextValue}>
      {children}
    </TypingDuelInviteContext.Provider>
  );
}

