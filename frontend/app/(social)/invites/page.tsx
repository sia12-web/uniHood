"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { InviteInbox } from "@/components/InviteInbox";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { getSocialSocket } from "@/lib/socket";
import { acceptInvite, cancelInvite, declineInvite, fetchInviteInbox, fetchInviteOutbox } from "@/lib/social";
import type { InviteSummary } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function InvitesPage() {
  const [inbox, setInbox] = useState<InviteSummary[]>([]);
  const [outbox, setOutbox] = useState<InviteSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    try {
      const [nextInbox, nextOutbox] = await Promise.all([
        fetchInviteInbox(DEMO_USER_ID, DEMO_CAMPUS_ID),
        fetchInviteOutbox(DEMO_USER_ID, DEMO_CAMPUS_ID),
      ]);
      setInbox(nextInbox);
      setOutbox(nextOutbox);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invites");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const socket = useMemo(() => getSocialSocket(DEMO_USER_ID, DEMO_CAMPUS_ID), []);

  useEffect(() => {
    const refresh = () => {
      void loadInvites();
    };
    socket.on("invite:new", refresh);
    socket.on("invite:update", refresh);
    socket.emit("subscribe_self");
    return () => {
      socket.off("invite:new", refresh);
      socket.off("invite:update", refresh);
    };
  }, [socket, loadInvites]);

  const handleAction = useCallback(
    async (
      action: "accept" | "decline" | "cancel",
      inviteId: string,
    ) => {
      setActionError(null);
      setStatusMessage(null);
      try {
        if (action === "accept") {
          await acceptInvite(DEMO_USER_ID, DEMO_CAMPUS_ID, inviteId);
          setStatusMessage("Invite accepted.");
        } else if (action === "decline") {
          await declineInvite(DEMO_USER_ID, DEMO_CAMPUS_ID, inviteId);
          setStatusMessage("Invite declined.");
        } else {
          await cancelInvite(DEMO_USER_ID, DEMO_CAMPUS_ID, inviteId);
          setStatusMessage("Invite cancelled.");
        }
        await loadInvites();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Invite action failed");
      }
    },
    [loadInvites],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Invites</h1>
        <p className="text-sm text-slate-600">Manage incoming and outgoing friendship invites.</p>
      </header>
      {statusMessage ? (
        <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{statusMessage}</p>
      ) : null}
      <InviteInbox
        inbox={inbox}
        outbox={outbox}
        loading={loading}
        error={error ?? actionError}
        onAccept={(inviteId) => void handleAction("accept", inviteId)}
        onDecline={(inviteId) => void handleAction("decline", inviteId)}
        onCancel={(inviteId) => void handleAction("cancel", inviteId)}
        profileData={{}}
      />
    </main>
  );
}
