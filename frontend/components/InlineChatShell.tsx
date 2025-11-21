"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

import { ChatRosterProvider } from "@/components/chat-roster-context";
import ChatConversationView from "@/components/ChatConversationView";
import { useChatRoster, type ChatRosterEntry } from "@/hooks/chat/use-chat-roster";
import { getDemoChatPeerId } from "@/lib/env";

function formatRosterTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(date);
}

function buildDemoEntry(peerId: string): ChatRosterEntry {
  return {
    peerId,
    displayName: "Demo chat",
    handle: null,
    avatarUrl: null,
    isDemo: true,
    lastMessageSnippet: "Seeded conversation",
    lastMessageAt: null,
    unreadCount: 0,
  };
}

function getInitialFor(entry: ChatRosterEntry): string {
  if (entry.isDemo) {
    return "↺";
  }
  const nameInitial = entry.displayName?.trim().charAt(0);
  if (nameInitial) {
    return nameInitial.toUpperCase();
  }
  return entry.peerId.slice(0, 1).toUpperCase();
}

function getSecondaryText(entry: ChatRosterEntry): string {
  if (entry.isDemo) {
    return "Seeded conversation";
  }
  if (entry.handle) {
    return `@${entry.handle}`;
  }
  return entry.peerId.slice(0, 12);
}

export default function InlineChatShell() {
  const { entries, loading, error, refresh, activePeerId, setActiveConversation, updateConversationSnapshot } = useChatRoster();
  const [query, setQuery] = useState("");
  const demoPeerId = getDemoChatPeerId();

  const rosterEntries = useMemo(() => {
    if (!demoPeerId) {
      return entries;
    }
    if (entries.some((entry) => entry.peerId === demoPeerId)) {
      return entries;
    }
    return [...entries, buildDemoEntry(demoPeerId)];
  }, [entries, demoPeerId]);

  const filteredEntries = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return rosterEntries;
    }
    return rosterEntries.filter((entry) => {
      const name = entry.displayName?.toLowerCase() ?? "";
      const handle = entry.handle?.toLowerCase() ?? "";
      return name.includes(trimmed) || handle.includes(trimmed) || entry.peerId.toLowerCase().includes(trimmed);
    });
  }, [rosterEntries, query]);

  return (
    <ChatRosterProvider
      value={{
        entries: rosterEntries,
        loading,
        error,
        refresh,
        activePeerId,
        setActiveConversation,
        updateConversationSnapshot,
      }}
    >
      <section className="flex min-h-[32rem] flex-col gap-4 rounded-3xl border border-rose-100 bg-white/95 p-4 shadow-xl lg:flex-row">
        <aside className="w-full rounded-2xl border border-rose-100 bg-rose-50/40 p-4 lg:w-80">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.55rem] font-semibold uppercase tracking-[0.35em] text-rose-500">Direct threads</p>
              <h2 className="text-lg font-semibold text-slate-900">Chats</h2>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700"
              onClick={() => refresh()}
            >
              Refresh
            </button>
          </div>
          <label htmlFor="inline-chat-search" className="sr-only">
            Search chats
          </label>
          <input
            id="inline-chat-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            placeholder="Search by name or handle"
          />
          <div className="mt-4 flex h-[22rem] flex-col gap-2 overflow-y-auto">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <div key={`chat-skeleton-${index}`} className="h-16 animate-pulse rounded-2xl bg-white/60" />)
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-600">
                <p className="font-semibold uppercase tracking-[0.2em]">Chats unavailable</p>
                <p className="mt-1">{error}</p>
                <button
                  type="button"
                  onClick={() => refresh()}
                  className="mt-2 inline-flex items-center justify-center rounded-full border border-rose-400 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-rose-600"
                >
                  Retry
                </button>
              </div>
            ) : filteredEntries.length ? (
              filteredEntries.map((entry) => {
                const isActive = entry.peerId === activePeerId;
                const timestamp = entry.lastMessageAt ? formatRosterTimestamp(entry.lastMessageAt) : null;
                const unread = entry.unreadCount ?? 0;
                const unreadLabel = unread > 9 ? "9+" : String(unread);
                const secondaryText = entry.lastMessageSnippet ?? getSecondaryText(entry);
                return (
                  <button
                    key={entry.peerId}
                    type="button"
                    onClick={() => setActiveConversation(entry.peerId)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition",
                      isActive ? "border-slate-900 bg-slate-900 text-white" : "border-transparent bg-white/80 hover:border-rose-200",
                    )}
                  >
                    <span
                      className={clsx(
                        "flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-semibold",
                        isActive ? "bg-white/20" : "bg-rose-100 text-rose-600",
                      )}
                      aria-hidden
                    >
                      {getInitialFor(entry)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={clsx("truncate text-sm", isActive ? "text-white" : "text-slate-900 font-semibold")}>{entry.displayName}</p>
                        {timestamp ? (
                          <time dateTime={entry.lastMessageAt ?? undefined} className={clsx("flex-none text-[0.65rem] uppercase", isActive ? "text-white/70" : "text-slate-500")}> 
                            {timestamp}
                          </time>
                        ) : null}
                      </div>
                      <p className={clsx("truncate text-xs", isActive ? "text-white/80" : "text-slate-500")}>{secondaryText}</p>
                    </div>
                    {unread > 0 ? (
                      <span className="ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full bg-rose-500 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white">
                        {unreadLabel}
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-rose-200 px-3 py-4 text-center text-xs text-slate-500">
                No conversations yet. Add friends to unlock chats.
              </div>
            )}
          </div>
        </aside>
        <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white/90 p-4">
          {activePeerId ? (
            <ChatConversationView peerId={activePeerId} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm font-semibold text-slate-900">Select a chat to get started</p>
              <p className="max-w-sm text-xs text-slate-500">
                Keep the conversation flowing without leaving the dashboard. Choose a friend on the left to open your thread.
              </p>
            </div>
          )}
        </div>
      </section>
    </ChatRosterProvider>
  );
}
