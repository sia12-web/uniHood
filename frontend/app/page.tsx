
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
import HomeProximityPreview from "@/components/HomeProximityPreview";
import { useTypingDuelInviteState } from "@/components/providers/typing-duel-invite-provider";
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
  const [showExperimental, setShowExperimental] = useState(false);

  const { inboundPending } = useInviteInboxCount();
  const {
    hasNotification: hasFriendAcceptanceNotification,
    latestFriendPeerId,
  } = useFriendAcceptanceIndicator();
  const { totalUnread: chatUnreadCount, acknowledgeAll: acknowledgeChatUnread } = useChatUnreadIndicator();
  const { hasPending: hasTypingInvite, openLatest: openTypingInvite } = useTypingDuelInviteState();
  const hasFriendsNotification = hasFriendAcceptanceNotification || inboundPending > 0;
  const friendsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (hasFriendAcceptanceNotification) {
      params.set("filter", "accepted");
      if (latestFriendPeerId) {
        params.set("focus", latestFriendPeerId);
      }
    } else if (inboundPending > 0) {
      params.set("filter", "pending");
    }
    const query = params.toString();
    return query ? `/friends?${query}` : "/friends";
  }, [hasFriendAcceptanceNotification, inboundPending, latestFriendPeerId]);
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
      {
        href: "/activities",
        title: "Activities",
        description: "Start a typing duel or quick trivia game with a friend.",
        accentDefault: "from-emerald-200 via-emerald-100 to-transparent",
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
    if (authUser.displayName?.trim()) return `Welcome, ${authUser.displayName.split(" " )[0]}`;
    if (authUser.handle) return `Welcome, @${authUser.handle}`;
    return "Welcome";
  }, [authUser]);

  const handleSignOut = useCallback(() => {
    clearAuthSnapshot();
    setAuthUser(null);
  }, []);

  const experimentalGradients: Record<string, string> = {
    Friends: "from-pink-500/30 via-pink-400/10 to-transparent",
    Chat: "from-sky-500/30 via-sky-400/10 to-transparent",
    Activities: "from-emerald-500/30 via-emerald-400/10 to-transparent",
  };

  const formatCount = (value: number): string => (value > 99 ? "99+" : String(value));

  const renderLinkCards = (variant: "classic" | "experimental") =>
    rightLinks.map((link) => {
      const isFriendsLink = link.title === "Friends" && Boolean(authUser);
      const showFriendsBadge = isFriendsLink && hasFriendsNotification;
      const friendsBadgeLabel = inboundPending > 0 ? formatCount(inboundPending) : "??";
      const isChatLink = link.title === "Chat" && Boolean(authUser);
      const showChatBadge = isChatLink && chatUnreadCount > 0;
      const chatBadgeLabel = formatCount(chatUnreadCount);
      const isActivitiesLink = link.title === "Activities";
      const showActivitiesBadge = isActivitiesLink && hasTypingInvite;

      const cardClass =
        variant === "classic"
          ? "group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          : "group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg transition hover:-translate-y-1 hover:bg-white/10";
      const accentClass =
        variant === "classic"
          ? `pointer-events-none absolute inset-0 bg-gradient-to-br ${link.accentDefault} opacity-0 transition-opacity group-hover:opacity-100`
          : `pointer-events-none absolute inset-0 bg-gradient-to-br ${experimentalGradients[link.title] ?? "from-white/20 via-white/5 to-transparent"} opacity-60 transition-opacity group-hover:opacity-100`;
      const titleClass = variant === "classic" ? "text-sm font-semibold text-slate-900" : "text-sm font-semibold text-white";
      const descriptionClass = variant === "classic" ? "text-sm text-slate-600" : "text-sm text-slate-200";
      const openClass = variant === "classic" ? "text-slate-900" : "text-white";

      return (
        <Link
          key={`${variant}-${link.href}`}
          href={link.href}
          className={cardClass}
          onClick={() => {
            if (isChatLink) {
              acknowledgeChatUnread();
            }
            if (isActivitiesLink && hasTypingInvite) {
              openTypingInvite();
            }
          }}
        >
          <span className={accentClass} aria-hidden />
          <div className="relative flex h-full flex-col gap-2">
            <span className={`flex items-center gap-2 ${titleClass}`}>
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
              {showActivitiesBadge ? (
                <span
                  className="inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[0.65rem] font-semibold text-white shadow-sm"
                  aria-label="Activity invite waiting"
                >
                  ??
                </span>
              ) : null}
            </span>
            <p className={descriptionClass}>{link.description}</p>
            <span className={`mt-auto inline-flex items-center gap-2 text-xs font-semibold ${openClass}`}>
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
    });

  const classicView = (
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
          <div className="flex flex-col items-center gap-3 pt-6">
            <div className="flex items-center justify-center rounded-full bg-cream p-6 shadow-soft ring-1 ring-white/60">
              <BrandLogo className="flex" logoClassName="h-36 w-auto drop-shadow-xl" logoWidth={180} logoHeight={180} />
            </div>
            <span className="text-xl font-semibold tracking-[0.35em] text-slate-800">DIVAN</span>
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
              Sign up to unlock proximity, invitations, and chat. {" "}
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
          <div className="flex w-full flex-col gap-3.5 lg:w-72 xl:w-80">{renderLinkCards("classic")}</div>
        </div>
      </section>
    </main>
  );

  const stats = [
    { label: "Pending invites", value: inboundPending > 0 ? formatCount(inboundPending) : "All clear" },
    { label: "Unread chat", value: chatUnreadCount > 0 ? formatCount(chatUnreadCount) : "0" },
    { label: "Activity queue", value: hasTypingInvite ? "Invite waiting" : "Choose any game" },
  ];

  const experimentalView = (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-28 pt-28">
        <div className="flex flex-col-reverse gap-10 lg:flex-row">
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.4em] text-slate-300">
              <BrandLogo
                className="flex"
                logoClassName="h-10 w-auto text-white drop-shadow-lg"
                logoWidth={120}
                logoHeight={120}
              />
              <span>Divan</span>
            </div>
            <div>
              <p className="text-sm text-slate-300">Campus presence toolkit</p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                {greeting}. Curate your micro-community and jump into motion.
              </h1>
              <p className="mt-4 text-base text-slate-200">
                The redesigned home pulls together proximity, invites, and conversations into one ritual. Queue up an activity, welcome new
                friends, or return to a live chat without leaving the radar.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/activities"
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                Launch an activity
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (hasTypingInvite) {
                    openTypingInvite();
                    return;
                  }
                  setShowExperimental(false);
                }}
                className="rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
              >
                {hasTypingInvite ? "Jump to invite" : "Preview typing duel"}
              </button>
              <Link
                href={friendsHref}
                className="rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
              >
                Visit friends
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-slate-300">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
            <p className="text-sm font-semibold text-slate-200">Live radar preview</p>
            <div className="rounded-3xl bg-white p-4 text-slate-900 shadow-xl">
              <HomeProximityPreview />
            </div>
          </div>
        </div>

        {hydrated && !authUser ? (
          <div className="rounded-3xl border border-white/10 bg-rose-500/10 p-4 text-sm text-rose-100 shadow-lg">
            <p>
              Sign up to unlock live proximity and invite routing. {" "}
              <Link href="/onboarding" className="font-semibold text-white underline-offset-4 hover:underline">
                Create your account
              </Link>{" "}
              or{" "}
              <Link href="/login" className="font-semibold text-white underline-offset-4 hover:underline">
                sign in
              </Link>{" "}
              to continue.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">{renderLinkCards("experimental")}</div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur">
          <h2 className="text-xl font-semibold">Focus queue</h2>
          <p className="text-sm text-slate-200">
            Use this rhythm for sprint planning: check invites, warm up a chat, then launch an activity without leaving home base.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-300">1. Sweep invites</p>
              <p className="mt-1 text-sm text-slate-100">Approve new friends or send a ping to someone glowing on the radar.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-300">2. Light up chat</p>
              <p className="mt-1 text-sm text-slate-100">Drop a note in the shared room or jump back into a focused thread.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-300">3. Start an activity</p>
              <p className="mt-1 text-sm text-slate-100">Typing duel, trivia, or RPS?choose the vibe and start a countdown.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );

  return (
    <div className="relative min-h-screen">
      <div className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold shadow-lg ring-1 ring-slate-200 backdrop-blur dark:bg-slate-900/70 dark:text-slate-100 dark:ring-white/20">
        <span className="hidden text-slate-600 dark:text-slate-200 sm:inline">Layout preview</span>
        <button
          type="button"
          onClick={() => setShowExperimental((prev) => !prev)}
          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-slate-800 dark:bg-white/20 dark:text-slate-900 dark:hover:bg-white/30"
          aria-pressed={showExperimental}
        >
          {showExperimental ? "Use classic view" : "Try new design"}
        </button>
      </div>
      {showExperimental ? experimentalView : classicView}
    </div>
  );
}
