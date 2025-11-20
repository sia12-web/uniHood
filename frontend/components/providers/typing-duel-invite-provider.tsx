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

import { useTypingDuelInvite, type TypingDuelInvite } from "@/hooks/activities/use-typing-duel-invite";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

export type TypingDuelInviteContextValue = {
  hasPending: boolean;
  pendingInvite: TypingDuelInvite | null;
  isSessionOpen: boolean;
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
  const toast = useToast();
  const router = useRouter();
  const { invite, acknowledge } = useTypingDuelInvite();
  const [pending, setPending] = useState<InviteBundle | null>(null);
  const [snoozed, setSnoozed] = useState<InviteBundle | null>(null);
  const shownToasts = useRef(new Set<string>());

  useEffect(() => {
    if (!invite) {
      return;
    }
    setPending(invite);
    setSnoozed(null);
    if (!shownToasts.current.has(invite.sessionId)) {
      shownToasts.current.add(invite.sessionId);
      toast.push({
        id: `typing-duel-${invite.sessionId}`,
        title: "Typing duel invite",
        description: "A friend just opened a typing duel lobby. Join to get ready.",
        variant: "success",
      });
    }
  }, [invite, toast]);

  const openLatest = useCallback(() => {
    const target = pending ?? snoozed;
    if (!target) {
      return;
    }
    if (pending && target.sessionId === pending.sessionId) {
      acknowledge(target.sessionId);
    }
    setPending(null);
    setSnoozed(null);
    router.push(`/activities/speed_typing?sessionId=${encodeURIComponent(target.sessionId)}`);
  }, [acknowledge, pending, router, snoozed]);

  const dismissLatest = useCallback(() => {
    const target = pending ?? snoozed;
    if (!target) {
      return;
    }
    if (pending && target.sessionId === pending.sessionId) {
      acknowledge(target.sessionId);
    }
    setPending(null);
    setSnoozed(null);
  }, [acknowledge, pending, snoozed]);

  const contextValue = useMemo<TypingDuelInviteContextValue>(() => {
    return {
      hasPending: Boolean(pending || snoozed),
      pendingInvite: pending ?? snoozed,
      isSessionOpen: false,
      openLatest,
      dismissLatest,
    };
  }, [dismissLatest, openLatest, pending, snoozed]);

  return (
    <TypingDuelInviteContext.Provider value={contextValue}>
      {children}
      <PendingInviteCard
        invite={pending}
        onAccept={openLatest}
        onDismiss={dismissLatest}
        isHidden={false}
      />
      <SnoozedInviteChip invite={!pending ? snoozed : null} onClick={openLatest} />
    </TypingDuelInviteContext.Provider>
  );
}

type PendingInviteCardProps = {
  invite: InviteBundle | null;
  onAccept: () => void;
  onDismiss: () => void;
  isHidden: boolean;
};

function PendingInviteCard({ invite, onAccept, onDismiss, isHidden }: PendingInviteCardProps) {
  if (!invite || isHidden) {
    return null;
  }
  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[min(360px,90vw)]">
      <div className="rounded-3xl border border-sky-200 bg-white/95 p-4 shadow-xl backdrop-blur">
        <p className="text-sm font-semibold text-slate-900">Typing duel invite</p>
        <p className="mt-1 text-xs text-slate-600">
          A friend just challenged you. Join the lobby to ready up.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
          >
            Join now
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

type SnoozedInviteChipProps = {
  invite: InviteBundle | null;
  onClick: () => void;
};

function SnoozedInviteChip({ invite, onClick }: SnoozedInviteChipProps) {
  if (!invite) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-slate-300 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur transition hover:border-slate-400 hover:text-slate-900"
    >
      Reopen typing duel lobby
    </button>
  );
}
