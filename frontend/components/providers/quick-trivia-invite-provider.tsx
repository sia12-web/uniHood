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

import { useQuickTriviaInvite, type QuickTriviaInvite } from "@/hooks/activities/use-quick-trivia-invite";
import { useRouter } from "next/navigation";

export type QuickTriviaInviteContextValue = {
  hasPending: boolean;
  pendingInvite: QuickTriviaInvite | null;
  openLatest: () => void;
  dismissLatest: () => void;
};

const QuickTriviaInviteContext = createContext<QuickTriviaInviteContextValue | null>(null);

export function useQuickTriviaInviteState(): QuickTriviaInviteContextValue {
  const context = useContext(QuickTriviaInviteContext);
  if (!context) {
    throw new Error("useQuickTriviaInviteState must be used within QuickTriviaInviteProvider");
  }
  return context;
}

type ProviderProps = {
  children: ReactNode;
};

export function QuickTriviaInviteProvider({ children }: ProviderProps) {
  const router = useRouter();
  const { invite, acknowledge } = useQuickTriviaInvite();
  const [pending, setPending] = useState<QuickTriviaInvite | null>(null);

  useEffect(() => {
    setPending(invite ?? null);
  }, [invite]);

  const openLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    router.push(`/activities/quick_trivia?session=${pending.sessionId}`);
  }, [pending, router]);

  const dismissLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    acknowledge(pending.sessionId);
    setPending(null);
  }, [acknowledge, pending]);

  const contextValue = useMemo<QuickTriviaInviteContextValue>(() => {
    return {
      hasPending: Boolean(pending),
      pendingInvite: pending,
      openLatest,
      dismissLatest,
    };
  }, [dismissLatest, openLatest, pending]);

  return (
    <QuickTriviaInviteContext.Provider value={contextValue}>
      {children}
    </QuickTriviaInviteContext.Provider>
  );
}
