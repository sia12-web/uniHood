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

import { useTicTacToeInvite, type TicTacToeInvite } from "@/hooks/activities/use-tictactoe-invite";
import { useRouter } from "next/navigation";

export type TicTacToeInviteContextValue = {
  hasPending: boolean;
  pendingInvite: TicTacToeInvite | null;
  openLatest: () => void;
  dismissLatest: () => void;
};

const TicTacToeInviteContext = createContext<TicTacToeInviteContextValue | null>(null);

export function useTicTacToeInviteState(): TicTacToeInviteContextValue {
  const context = useContext(TicTacToeInviteContext);
  if (!context) {
    throw new Error("useTicTacToeInviteState must be used within TicTacToeInviteProvider");
  }
  return context;
}

type ProviderProps = {
  children: ReactNode;
};

export function TicTacToeInviteProvider({ children }: ProviderProps) {
  const router = useRouter();
  const { invite, acknowledge } = useTicTacToeInvite();
  const [pending, setPending] = useState<TicTacToeInvite | null>(null);

  useEffect(() => {
    setPending(invite ?? null);
  }, [invite]);

  const openLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    router.push(`/activities/tictactoe?session=${pending.sessionId}`);
  }, [pending, router]);

  const dismissLatest = useCallback(() => {
    if (!pending) {
      return;
    }
    acknowledge(pending.sessionId);
    setPending(null);
  }, [acknowledge, pending]);

  const contextValue = useMemo<TicTacToeInviteContextValue>(() => {
    return {
      hasPending: Boolean(pending),
      pendingInvite: pending,
      openLatest,
      dismissLatest,
    };
  }, [dismissLatest, openLatest, pending]);

  return (
    <TicTacToeInviteContext.Provider value={contextValue}>
      {children}
    </TicTacToeInviteContext.Provider>
  );
}
