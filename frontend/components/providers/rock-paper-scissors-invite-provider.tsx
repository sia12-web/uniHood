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

import { useRockPaperScissorsInvite, type RockPaperScissorsInvite } from "@/hooks/activities/use-rock-paper-scissors-invite";
import { useRouter } from "next/navigation";

export type RockPaperScissorsInviteContextValue = {
  hasPending: boolean;
  pendingInvite: RockPaperScissorsInvite | null;
  openLatest: () => void;
  dismissLatest: () => void;
};

const RockPaperScissorsInviteContext = createContext<RockPaperScissorsInviteContextValue | null>(null);

export function useRockPaperScissorsInviteState(): RockPaperScissorsInviteContextValue {
  const context = useContext(RockPaperScissorsInviteContext);
  if (!context) {
    throw new Error("useRockPaperScissorsInviteState must be used within RockPaperScissorsInviteProvider");
  }
  return context;
}

type ProviderProps = {
  children: ReactNode;
};

export function RockPaperScissorsInviteProvider({ children }: ProviderProps) {
  const router = useRouter();
  const { invite, acknowledge } = useRockPaperScissorsInvite();
  const [pending, setPending] = useState<RockPaperScissorsInvite | null>(null);

  useEffect(() => {
    setPending(invite ?? null);
  }, [invite]);

  const openLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    router.push(`/activities/rock_paper_scissors?session=${pending.sessionId}`);
  }, [pending, router]);

  const dismissLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    acknowledge(pending.sessionId);
    setPending(null);
  }, [acknowledge, pending]);

  const contextValue = useMemo<RockPaperScissorsInviteContextValue>(() => {
    return {
      hasPending: Boolean(pending),
      pendingInvite: pending,
      openLatest,
      dismissLatest,
    };
  }, [dismissLatest, openLatest, pending]);

  return (
    <RockPaperScissorsInviteContext.Provider value={contextValue}>
      {children}
    </RockPaperScissorsInviteContext.Provider>
  );
}
