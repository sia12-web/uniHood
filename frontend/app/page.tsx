"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
import HomeProximityPreview from "@/components/HomeProximityPreview";
import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";
import { useInviteInboxCount } from "@/hooks/social/use-invite-count";
import { useChatUnreadIndicator } from "@/hooks/chat/use-chat-unread-indicator";
import { clearAuthSnapshot, onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";

type SimpleLink = {
  href: string;
  title: string;
  description: string;
  accentDefault: string;
};

export default function HomePage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const { inboundPending } = useInviteInboxCount();
  const { hasNotification: hasFriendAcceptanceNotification } = useFriendAcceptanceIndicator();
  const { totalUnread: chatUnreadCount, acknowledgeAll: acknowledgeChatUnread } = useChatUnreadIndicator();
  const hasFriendsNotification = hasFriendAcceptanceNotification || inboundPending > 0;
  const friendsHref = hasFriendAcceptanceNotification
    ? "/friends?filter=accepted"
    : inboundPending > 0
      ? "/friends?filter=pending"
      : "/friends";
  const rightLinks = useMemo<SimpleLink[]>(
    () => [
      {
        href: friendsHref,
        title: "Friends",
        description: "Review pending invites and see who is live right now.",
        accentDefault: "from-blue-200 via-blue-100 to-transparent",
      },
      {
        href: "/chat",
        title: "Chat",
        description: "Pick up conversations without leaving the radar view.",
        accentDefault: "from-rose-200 via-rose-100 to-transparent",
      },
    ],
    [friendsHref],
  );

  useEffect(() => {
    setAuthUser(readAuthUser());
    const unsubscribe = onAuthChange(() => {
      setAuthUser(readAuthUser());
    });
    setHydrated(true);
    return () => unsubscribe();
  }, []);

  const greeting = useMemo(() => {
    if (!authUser) return "Welcome";
    if (authUser.displayName?.trim()) return `Welcome, ${authUser.displayName.split(" ")[0]}`;
    if (authUser.handle) return `Welcome, @${authUser.handle}`;
    return "Welcome";
  }, [authUser]);

  const handleSignOut = useCallback(() => {
    clearAuthSnapshot();
    setAuthUser(null);
  }, []);

  return (
    <main className="min-h-screen bg-lavender-haze overflow-y-scroll">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-14 pt-16 sm:pb-16 sm:pt-20">
        <header className="relative flex w-full flex-col items-center gap-3 text-slate-900">
          <nav aria-label="Primary" className="absolute right-0 top-0 flex items-center gap-2 text-sm font-semibold">
            {authUser ? (
              <>
                <Link
                  href="/settings/profile"
                  className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
                >
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
                >
                  Join
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Sign in
                </Link>
              </>
            )}
          </nav>
          <div className="flex flex-col items-center gap-2 pt-6">
            <BrandLogo className="h-32" />
            <span className="text-lg font-semibold tracking-[0.4em] text-slate-700">DIVAN</span>
          </div>
          <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>
          <p className="text-center text-base font-medium text-slate-600 sm:text-lg">Find people near you.</p>
          <p className="text-center text-sm text-slate-600 sm:text-base">
            Use your discovery radius to spotlight classmates, then jump into invitations, friends, or chat when the timing feels right.
          </p>
        </header>

        {hydrated && !authUser ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700 shadow-sm">
            <p className="text-center">
              Sign up to unlock proximity, invitations, and chat.{" "}
              <Link href="/onboarding" className="font-semibold text-slate-900 underline-offset-4 hover:underline">
                Create your account
              </Link>{" "}
              or{" "}
              <Link href="/login" className="font-semibold text-slate-900 underline-offset-4 hover:underline">
                sign in
              </Link>{" "}
              to continue.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <HomeProximityPreview />
          <div className="flex w-full flex-col gap-3.5 lg:w-72 xl:w-80">
            {rightLinks.map((link) => {
              const isFriendsLink = link.title === "Friends" && Boolean(authUser);
              const showFriendsBadge = isFriendsLink && hasFriendsNotification;
              const friendsBadgeLabel = inboundPending > 0 ? (inboundPending > 99 ? "99+" : String(inboundPending)) : "●";
              const isChatLink = link.title === "Chat" && Boolean(authUser);
              const showChatBadge = isChatLink && chatUnreadCount > 0;
              const chatBadgeLabel = chatUnreadCount > 99 ? "99+" : String(chatUnreadCount);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  onClick={() => {
                    if (isChatLink) {
                      acknowledgeChatUnread();
                    }
                  }}
                >
                  <span
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${link.accentDefault} opacity-0 transition-opacity group-hover:opacity-100`}
                    aria-hidden
                  />
                  <div className="relative flex h-full flex-col gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      {link.title}
                      {showFriendsBadge ? (
                        <span
                          className="inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[0.65rem] font-semibold text-white shadow-sm"
                          aria-label={`${friendsBadgeLabel} pending invites`}
                        >
                          {friendsBadgeLabel}
                        </span>
                      ) : null}
                      {showChatBadge ? (
                        <span
                          className="inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[0.65rem] font-semibold text-white shadow-sm"
                          aria-label={`${chatBadgeLabel} unread chats`}
                        >
                          {chatBadgeLabel}
                        </span>
                      ) : null}
                    </span>
                    <p className="text-sm text-slate-600">{link.description}</p>
                    <span className="mt-auto inline-flex items-center gap-2 text-xs font-semibold text-slate-900">
                      Open
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
