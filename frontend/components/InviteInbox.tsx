import React from "react";

import type { InviteSummary } from "@/lib/types";

interface InviteInboxProps {
  inbox: InviteSummary[];
  outbox: InviteSummary[];
  loading: boolean;
  error?: string | null;
  onAccept(inviteId: string): void;
  onDecline(inviteId: string): void;
  onCancel(inviteId: string): void;
}

function resolveParty(invite: InviteSummary, role: "from" | "to") {
  const displayName = role === "from" ? invite.from_display_name : invite.to_display_name;
  const handle = role === "from" ? invite.from_handle : invite.to_handle;
  const userId = role === "from" ? invite.from_user_id : invite.to_user_id;
  const name = displayName ?? handle ?? userId;
  return { name, handle, userId };
}

function PartyBadge({ label, handle }: { label: string; handle: string | null | undefined }) {
  return (
    <span className="inline-flex flex-col">
      <span className="font-semibold text-slate-900">{label}</span>
      {handle && handle !== label ? <span className="text-xs text-slate-500">@{handle}</span> : null}
    </span>
  );
}

export function InviteInbox({ inbox, outbox, loading, error, onAccept, onDecline, onCancel }: InviteInboxProps) {
  if (error) {
    return <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>;
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading invites…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-lg font-semibold text-slate-900">Inbox</h2>
        {inbox.length === 0 ? (
          <p className="text-sm text-slate-500">No pending invites.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {inbox.map((invite) => {
              const fromParty = resolveParty(invite, "from");
              const toParty = resolveParty(invite, "to");
              return (
                <li key={invite.id} className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="text-sm text-slate-600">
                    <p className="flex flex-wrap items-center gap-2">
                      <PartyBadge label={fromParty.name} handle={fromParty.handle} />
                      <span className="text-slate-400">→</span>
                      <PartyBadge label={toParty.name} handle={toParty.handle} />
                    </p>
                    <p className="text-xs text-slate-500">Sent {new Date(invite.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <button className="rounded bg-emerald-600 px-3 py-1 text-white" onClick={() => onAccept(invite.id)}>
                      Accept
                    </button>
                    <button className="rounded bg-slate-200 px-3 py-1" onClick={() => onDecline(invite.id)}>
                      Decline
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Outbox</h2>
        {outbox.length === 0 ? (
          <p className="text-sm text-slate-500">No invites sent.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {outbox.map((invite) => {
              const fromParty = resolveParty(invite, "from");
              const toParty = resolveParty(invite, "to");
              return (
                <li key={invite.id} className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="text-sm text-slate-600">
                    <p className="flex flex-wrap items-center gap-2">
                      <PartyBadge label={fromParty.name} handle={fromParty.handle} />
                      <span className="text-slate-400">→</span>
                      <PartyBadge label={toParty.name} handle={toParty.handle} />
                    </p>
                    <p className="text-xs text-slate-500">Sent {new Date(invite.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <button className="rounded bg-slate-200 px-3 py-1" onClick={() => onCancel(invite.id)}>
                      Cancel
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
