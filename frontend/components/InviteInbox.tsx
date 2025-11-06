"use client";

import Image from "next/image";

import type { InviteSummary, PublicProfile } from "@/lib/types";

interface InviteInboxProps {
  inbox: InviteSummary[];
  outbox: InviteSummary[];
  loading: boolean;
  error?: string | null;
  onAccept(inviteId: string): void;
  onDecline(inviteId: string): void;
  onCancel(inviteId: string): void;
  profileData: Record<string, InviteProfileState>;
}

type InviteProfileState = {
  profile: PublicProfile | null;
  loading: boolean;
  error: string | null;
};

function resolveParty(invite: InviteSummary, role: "from" | "to") {
  const displayName = role === "from" ? invite.from_display_name : invite.to_display_name;
  const handle = role === "from" ? invite.from_handle : invite.to_handle;
  const userId = role === "from" ? invite.from_user_id : invite.to_user_id;
  const name = displayName ?? handle ?? userId;
  return { name, handle, userId };
}

function formatTimestamp(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function safeInitial(text: string) {
  return text.slice(0, 1).toUpperCase();
}

export function InviteInbox({
  inbox,
  outbox,
  loading,
  error,
  onAccept,
  onDecline,
  onCancel,
  profileData,
}: InviteInboxProps) {
  if (error) {
    return <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>;
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading invites…</p>;
  }

  const renderInbox = () => {
    if (inbox.length === 0) {
      return null;
    }

    return (
      <ul className="space-y-4">
        {inbox.map((invite) => {
          const senderName = invite.from_display_name ?? invite.from_handle ?? invite.from_user_id;
          const initial = safeInitial(senderName);
          const state: InviteProfileState = profileData[invite.id] ?? {
            profile: null,
            loading: false,
            error: null,
          };
          const avatarUrl = state.profile?.avatar_url ?? null;
          const major = state.profile?.program?.trim();
          const galleryItems = state.profile?.gallery
            ?.filter((item) => Boolean(item?.url))
            .slice(0, 4);

          return (
            <li key={invite.id} className="rounded-3xl border border-slate-200 bg-white/90 shadow-sm">
              <div className="flex flex-col gap-4 p-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16">
                    {state.loading ? (
                      <div className="h-full w-full animate-pulse rounded-2xl bg-slate-200" />
                    ) : avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt={`${senderName} avatar`}
                        fill
                        sizes="64px"
                        className="rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-200 text-lg font-semibold text-slate-600">
                        {initial}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Major</span>
                    <span className="text-sm text-slate-700">
                      {state.loading ? "Loading…" : major || "Not shared"}
                    </span>
                  </div>
                </div>

                {state.error ? (
                  <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{state.error}</p>
                ) : null}

                {galleryItems && galleryItems.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {galleryItems.map((item) => (
                      <div key={item.key ?? item.url} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-slate-100">
                        <Image
                          src={String(item.url)}
                          alt={`${senderName} gallery photo`}
                          fill
                          sizes="(max-width: 640px) 25vw, 120px"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="flex aspect-[4/5] items-center justify-center rounded-2xl bg-slate-100 text-[0.65rem] text-slate-400"
                      >
                        {state.loading ? "Loading…" : "No photos"}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onAccept(invite.id)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-500"
                  >
                    Accept invite
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecline(invite.id)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };
  const renderOutbox = () => {
    if (outbox.length === 0) {
      return null;
    }

    return (
      <ul className="space-y-3">
        {outbox.map((invite) => {
          const toParty = resolveParty(invite, "to");
          const sentAt = formatTimestamp(invite.created_at);
          return (
            <li
              key={invite.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-sm font-semibold text-indigo-600">
                  {safeInitial(toParty.name)}
                </div>
                <div className="flex flex-1 flex-col gap-1 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{toParty.name}</span>
                  {toParty.handle ? <span className="text-xs text-slate-500">@{toParty.handle}</span> : null}
                  <span className="text-xs text-slate-400">Sent {sentAt}</span>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onCancel(invite.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-300"
                >
                  Cancel invite
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {renderInbox()}
      {renderOutbox()}
    </div>
  );
}
