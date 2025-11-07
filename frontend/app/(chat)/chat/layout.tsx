"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { ChatRosterProvider } from "@/components/chat-roster-context";
import { useChatRoster, type ChatRosterEntry } from "@/hooks/chat/use-chat-roster";
import { getDemoChatPeerId } from "@/lib/env";

function formatRosterTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();
  if (isSameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  const isSameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: isSameYear ? undefined : "numeric",
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
  const fromName = entry.displayName?.trim().charAt(0);
  if (fromName) {
    return fromName.toUpperCase();
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

export default function ChatLayout({ children }: { children: ReactNode }) {
  const { entries, loading, error, refresh, setActiveConversation, updateConversationSnapshot } = useChatRoster();
  const demoPeerId = getDemoChatPeerId();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const match = /^\/chat\/(.+)$/.exec(pathname ?? "");
    if (match) {
      setActiveConversation(match[1]);
    } else if (pathname?.endsWith("/chat")) {
      setActiveConversation(null);
    }
  }, [pathname, setActiveConversation]);

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
    if (!query.trim()) {
      return rosterEntries;
    }
    const lower = query.trim().toLowerCase();
    return rosterEntries.filter((entry) => {
      const name = entry.displayName?.toLowerCase() ?? "";
      const handle = entry.handle?.toLowerCase() ?? "";
      return name.includes(lower) || handle.includes(lower) || entry.peerId.toLowerCase().includes(lower);
    });
  }, [rosterEntries, query]);

  const layoutHeightClass = "h-[calc(100vh-4rem)]";

  return (
    <ChatRosterProvider
      value={{ entries: rosterEntries, loading, error, refresh, setActiveConversation, updateConversationSnapshot }}
    >
      <div className={clsx("mx-auto flex w-full flex-1 flex-col gap-4 px-4 pb-4 pt-4", layoutHeightClass)}>
        <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-warm-sand bg-white shadow-xl md:flex-row">
          <aside className="flex h-full w-full flex-none flex-col border-b border-warm-sand bg-white/95 md:w-80 md:border-b-0 md:border-r">
            <div className="border-b border-warm-sand/80 px-5 py-4">
              <h2 className="text-lg font-semibold text-midnight">Chats</h2>
              <p className="mt-1 text-xs text-navy/60">Keep tabs on your latest conversations.</p>
              <div className="mt-3">
                <label htmlFor="chat-search" className="sr-only">
                  Search chats
                </label>
                <input
                  id="chat-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-2xl border border-warm-sand bg-white px-4 py-2 text-sm text-navy/80 focus:border-midnight focus:outline-none"
                  placeholder="Search by name or handle"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              {loading ? (
                <ul className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <li key={index} className="animate-pulse rounded-2xl bg-warm-sand/40 px-4 py-5" />
                  ))}
                </ul>
              ) : error ? (
                <div className="rounded-2xl border border-coral/40 bg-amber-50 px-4 py-3 text-xs text-coral">
                  <p className="font-semibold uppercase tracking-wide">Could not load chats</p>
                  <p className="mt-1">{error}</p>
                  <button
                    type="button"
                    onClick={() => refresh()}
                    className="mt-3 inline-flex items-center justify-center rounded-full border border-coral px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredEntries.length > 0 ? (
                <ul className="space-y-2">
                  {filteredEntries.map((entry) => {
                    const href = `/chat/${entry.peerId}`;
                    const isActive = pathname === href;
                    const unreadCount = entry.unreadCount ?? 0;
                    const secondaryText = entry.lastMessageSnippet ?? getSecondaryText(entry);
                    const timestamp = entry.lastMessageAt ? formatRosterTimestamp(entry.lastMessageAt) : null;
                    const unreadLabel = unreadCount > 9 ? "9+" : String(unreadCount);
                    const showUnreadHighlight = unreadCount > 0 && !isActive;
                    return (
                      <li key={entry.peerId}>
                        <Link
                          href={href}
                          className={clsx(
                            "flex items-center gap-3 rounded-2xl px-4 py-3 transition",
                            isActive ? "bg-midnight text-white" : "hover:bg-warm-sand/50",
                          )}
                          onClick={() => setActiveConversation(entry.peerId)}
                        >
                          <div
                            className={clsx(
                              "flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-semibold",
                              isActive ? "bg-white/20" : "bg-warm-sand text-midnight",
                            )}
                            aria-hidden="true"
                          >
                            {getInitialFor(entry)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {showUnreadHighlight ? (
                                  <span className="inline-flex h-2 w-2 flex-none rounded-full bg-coral" aria-hidden />
                                ) : null}
                                <p
                                  className={clsx(
                                    "truncate text-sm",
                                    isActive
                                      ? "text-white font-semibold"
                                      : showUnreadHighlight
                                      ? "text-midnight font-semibold"
                                      : "text-midnight font-medium",
                                  )}
                                >
                                  {entry.displayName}
                                </p>
                              </div>
                              {timestamp ? (
                                <time
                                  dateTime={entry.lastMessageAt ?? undefined}
                                  className={clsx("flex-none text-[11px] uppercase", isActive ? "text-slate-200" : "text-navy/50")}
                                >
                                  {timestamp}
                                </time>
                              ) : null}
                            </div>
                            <p
                              className={clsx(
                                "truncate text-xs",
                                isActive ? "text-slate-200" : showUnreadHighlight ? "text-midnight/80" : "text-navy/60",
                              )}
                            >
                              {secondaryText}
                            </p>
                          </div>
                          {unreadCount > 0 ? (
                            <span className="ml-2 inline-flex min-w-[1.75rem] justify-center rounded-full bg-coral px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                              {unreadLabel}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-2xl border border-warm-sand bg-cream px-4 py-6 text-sm text-navy/70">
                  <p className="font-semibold text-midnight">No conversations yet</p>
                  <p className="mt-2 text-xs text-navy/60">
                    Once you add or accept a friend, they will appear here so you can jump straight into a chat. Use the
                    Friends tab to start building your roster.
                  </p>
                </div>
              )}
            </div>
          </aside>
          <section className="flex min-h-full flex-1 flex-col bg-cream/30">
            <div className="flex-1 overflow-hidden">{children}</div>
          </section>
        </div>
      </div>
    </ChatRosterProvider>
  );
}
