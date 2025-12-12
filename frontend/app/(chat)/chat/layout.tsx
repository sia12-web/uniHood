"use client";

import clsx from "clsx";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MoreVertical, Trash2 } from "lucide-react";

import { apiFetch } from "@/app/lib/http/client";
import { getBackendUrl } from "@/lib/env";
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
  const { entries, loading, error, refresh, activePeerId, setActiveConversation, updateConversationSnapshot } = useChatRoster();
  const demoPeerId = getDemoChatPeerId();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [openMenuPeerId, setOpenMenuPeerId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-menu-container]')) {
        setOpenMenuPeerId(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const openMenu = (peerId: string, buttonEl: HTMLButtonElement) => {
    if (openMenuPeerId === peerId) {
      setOpenMenuPeerId(null);
      setMenuPosition(null);
      return;
    }
    const rect = buttonEl.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 4,
      left: rect.right - 192, // 192px = w-48
    });
    setOpenMenuPeerId(peerId);
  };

  const handleClearConversation = async (peerId: string) => {
    if (!confirm("Are you sure you want to clear this conversation? This cannot be undone.")) {
      return;
    }
    try {
      // If this is the active conversation, deselect it immediately for instant UI feedback
      const wasActive = activePeerId === peerId;
      if (wasActive) {
        setActiveConversation(null);
      }

      // Delete the conversation on the backend
      await apiFetch(`${getBackendUrl()}/chat/conversations/${peerId}`, {
        method: "DELETE",
      });

      // Refresh the roster to update the sidebar
      refresh();
    } catch (err) {
      console.error("Failed to clear conversation", err);
      alert("Failed to clear conversation");
    } finally {
      setOpenMenuPeerId(null);
    }
  };

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

  const layoutHeightClass = "min-h-[calc(100vh-4rem)]";

  if (!hydrated) {
    return null;
  }

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
      <div className={clsx("flex w-full flex-1 flex-col gap-4 px-3 pb-4 pt-4 md:px-6 bg-gradient-to-br from-[#fff6f2] via-[#ffe9e4] to-white", layoutHeightClass)}>
        <div className="flex h-full w-full flex-1 flex-col overflow-hidden rounded-3xl border border-[#f0d8d9] bg-white/95 shadow-2xl md:flex-row">
          <aside className="flex h-full w-full flex-none flex-col border-b border-[#f0d8d9] bg-white/95 md:w-96 md:border-b-0 md:border-r">
            <div className="border-b border-[#f0d8d9] px-5 py-4">
              <div className="flex items-center gap-3 mb-1">
                <Link
                  href="/"
                  className="text-slate-400 hover:text-[#b7222d] transition-colors p-1 -ml-1 rounded-full hover:bg-red-50"
                  aria-label="Back to home"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <h2 className="text-lg font-semibold text-[#b7222d]">Chats</h2>
              </div>
              <p className="text-xs text-slate-600">Keep tabs on your latest conversations.</p>
              <div className="mt-3">
                <label htmlFor="chat-search" className="sr-only">
                  Search chats
                </label>
                <input
                  id="chat-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-2xl border border-[#f0d8d9] bg-white px-4 py-2 text-sm text-slate-800 focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                  placeholder="Search by name or handle"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pt-3 pb-24">
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
                    const isActive = activePeerId ? entry.peerId === activePeerId : pathname === `/chat/${entry.peerId}`;
                    const unreadCount = entry.unreadCount ?? 0;
                    const secondaryText = entry.lastMessageSnippet ?? getSecondaryText(entry);
                    const timestamp = entry.lastMessageAt ? formatRosterTimestamp(entry.lastMessageAt) : null;
                    const unreadLabel = unreadCount > 9 ? "9+" : String(unreadCount);
                    const showUnreadHighlight = unreadCount > 0 && !isActive;
                    return (
                      <li key={entry.peerId} className="relative group" style={{ zIndex: openMenuPeerId === entry.peerId ? 20 : "auto" }}>
                        <button
                          type="button"
                          className={clsx(
                            "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition pr-10",
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
                        </button>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2" data-menu-container>
                          <button
                            type="button"
                            ref={(el) => {
                              if (el) menuButtonRefs.current.set(entry.peerId, el);
                            }}
                            className={clsx(
                              "p-1.5 rounded-full transition-all",
                              isActive ? "text-white/70 hover:bg-white/20 hover:text-white" : "text-slate-400 hover:bg-slate-200 hover:text-slate-600",
                              openMenuPeerId === entry.peerId ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              openMenu(entry.peerId, e.currentTarget);
                            }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
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
          <section className="flex min-h-full w-full flex-1 flex-col bg-[#fff8f4]">
            <div className="flex-1 overflow-hidden px-3 pb-5 pt-4 sm:px-4 md:px-6">
              <div className="h-full w-full rounded-3xl border border-[#f0d8d9] bg-white/95 shadow-xl ring-1 ring-[#f0d8d9]/70">
                {activePeerId ? <ChatConversationView peerId={activePeerId} /> : children}
              </div>
            </div>
          </section>
        </div>

        {/* Fixed position dropdown menu */}
        {openMenuPeerId && menuPosition && (
          <div
            className="fixed w-48 rounded-xl bg-white shadow-lg ring-1 ring-black/5 overflow-hidden"
            style={{
              zIndex: 9999,
              top: menuPosition.top,
              left: menuPosition.left,
            }}
            data-menu-container
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handleClearConversation(openMenuPeerId);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Clear conversation
            </button>
          </div>
        )}
      </div>
    </ChatRosterProvider>
  );
}
