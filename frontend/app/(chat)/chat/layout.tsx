"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { ChatRosterProvider } from "@/components/chat/chat-roster-context";
import BrandLogo from "@/components/BrandLogo";
import { useChatRoster, type ChatRosterEntry } from "@/hooks/chat/use-chat-roster";
import { getDemoChatPeerId } from "@/lib/env";

function buildDemoEntry(peerId: string): ChatRosterEntry {
  return {
    peerId,
    displayName: "Demo chat",
    handle: null,
    avatarUrl: null,
    isDemo: true,
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
  const { entries, loading, error, refresh } = useChatRoster();
  const demoPeerId = getDemoChatPeerId();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

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

  return (
    <ChatRosterProvider value={{ entries: rosterEntries, loading, error, refresh }}>
      <div className={clsx("mx-auto flex w-full flex-1 flex-col gap-4 px-4 pb-6", layoutHeightClass)}>
        <header className="flex items-center justify-between pt-6">
          <BrandLogo logoWidth={56} logoHeight={56} withWordmark />
          <Link href="/" className="text-sm font-semibold text-coral hover:text-coral/80">
            Back to home
          </Link>
        </header>
        <div className="flex h-full min-h-[520px] w-full flex-col overflow-hidden rounded-3xl border border-warm-sand bg-white shadow-xl md:flex-row">
          <aside className="flex h-full w-full flex-none flex-col border-b border-warm-sand bg-white/95 md:w-80 md:border-b-0 md:border-r">
            <div className="border-b border-warm-sand/80 px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-midnight">Chats</h2>
                <Link href="/friends" className="text-xs font-semibold text-coral hover:text-coral/80">
                  New friend →
                </Link>
              </div>
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
                    return (
                      <li key={entry.peerId}>
                        <Link
                          href={href}
                          className={clsx(
                            "flex items-center gap-3 rounded-2xl px-4 py-3 transition",
                            isActive ? "bg-midnight text-white" : "hover:bg-warm-sand/50",
                          )}
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
                            <p className={clsx("truncate text-sm font-medium", isActive ? "text-white" : "text-midnight")}>
                              {entry.displayName}
                            </p>
                            <p className={clsx("truncate text-xs", isActive ? "text-slate-200" : "text-navy/60")}>{getSecondaryText(entry)}</p>
                          </div>
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
