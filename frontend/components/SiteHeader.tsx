"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { useRouter, usePathname } from "next/navigation";
import { Bell, Gamepad2, Info, MessageSquare, ThumbsUp, UserPlus, LogOut } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { onAuthChange, readAuthUser, type AuthUser, clearAuthSnapshot } from "@/lib/auth-storage";
import { fetchNotificationUnreadCount, fetchNotifications, markNotificationRead, markAllNotificationsRead, type Notification, fetchInviteInbox } from "@/lib/social";
import { fetchProfile } from "@/lib/identity";
import { useMeetupNotifications } from "@/hooks/use-meetup-notifications";
import type { ProfileRecord } from "@/lib/types";
import { getSocialSocket } from "@/lib/socket";


function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const NOTIFICATIONS_LIMIT = 12;

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const time = date.getTime();
  if (Number.isNaN(time)) {
    return "";
  }
  const diffSeconds = Math.floor((Date.now() - time) / 1000);
  if (diffSeconds < 60) {
    return "just now";
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (!parts.length) {
    return "";
  }
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function resolveNotificationIcon(kind: string) {
  const normalized = kind.toLowerCase();
  if (normalized.includes("invite") || normalized.includes("friend") || normalized.includes("request")) {
    return UserPlus;
  }
  if (normalized.includes("comment") || normalized.includes("reply") || normalized.includes("message")) {
    return MessageSquare;
  }
  if (normalized.includes("like") || normalized.includes("reaction")) {
    return ThumbsUp;
  }
  if (normalized.includes("game") || normalized.includes("match") || normalized.includes("win")) {
    return Gamepad2;
  }
  if (normalized.includes("system") || normalized.includes("update")) {
    return Info;
  }
  return Bell;
}

export default function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const suppressedPrefixes = [
    // Landing pages often have their own header or none
    "/contact",
    "/legal",
    "/privacy",
    "/terms",
    "/cookies",
    // Auth
    "/login",
    "/onboarding",
    "/select-university",
    "/select-courses",
    "/set-profile",
    "/welcome",
    "/major-year",
    "/passions",
    "/photos",
    "/verify-email",
    "/join",
    "/reset-password",
    "/forgot-password",
  ];

  // Also suppress on root if it's a landing page (optional, depends on design)
  // But generally AuthenticatedAppChrome is for auth'd users.

  const shouldRenderHeader = !suppressedPrefixes.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
  );

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!shouldRenderHeader || typeof window === "undefined") {
      return;
    }
    setHydrated(true);
  }, [shouldRenderHeader, pathname]);

  const navLinks = useMemo<Array<{ href: string; label: string }>>(() => {
    return [
      { label: "Socials", href: "/socials" },
      { label: "Chat", href: "/chat" },
      { label: "Games", href: "/games" },
      { label: "Meetups", href: "/meetups" },
      { label: "Rank", href: "/leaderboards" },
    ];
  }, []);

  const visibleLinks = hydrated ? navLinks : [];

  const activeMap = useMemo(() => {
    return navLinks.reduce<Record<string, boolean>>((acc, link) => {
      acc[link.href] = isActive(pathname, link.href);
      return acc;
    }, {});
  }, [pathname, navLinks]);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const { hasNewMeetups, notifications: meetupNotifications, markAsSeen } = useMeetupNotifications();

  const handleSignOut = useCallback(() => {
    clearAuthSnapshot();
    setAuthUser(null);
    setNotifications([]);
    setUnreadCount(0);
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    const hydrate = () => {
      setAuthUser(readAuthUser());
    };
    hydrate();
    const unsubscribe = onAuthChange(hydrate);
    return () => unsubscribe();
  }, []);

  const loadProfile = useCallback(async (userId: string, campusId: string | null) => {
    return fetchProfile(userId, campusId);
  }, []);

  const loadNotifications = useCallback(
    async (userId: string, campusId: string | null, options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setNotificationsLoading(true);
      }
      setNotificationsError(null);
      try {
        const items = await fetchNotifications(userId, campusId, NOTIFICATIONS_LIMIT);
        setNotifications(items);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load notifications";
        setNotificationsError(message);
      } finally {
        if (!options.silent) {
          setNotificationsLoading(false);
        }
      }
    },
    [],
  );

  const loadUnreadCount = useCallback(async (userId: string, campusId: string | null) => {
    try {
      const count = await fetchNotificationUnreadCount(userId, campusId);
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to load unread notifications", err);
    }
  }, []);

  const markNotificationsRead = useCallback(
    async (entries: Notification[]) => {
      if (!authUser?.userId) {
        return;
      }
      const unread = entries.filter((entry) => !entry.read_at);
      if (!unread.length) {
        return;
      }
      const now = new Date().toISOString();
      const unreadIds = new Set(unread.map((entry) => entry.id));
      setNotifications((prev) =>
        prev.map((entry) =>
          unreadIds.has(entry.id) && !entry.read_at ? { ...entry, read_at: now } : entry,
        ),
      );
      setUnreadCount((prev) => Math.max(prev - unread.length, 0));
      await markAllNotificationsRead(authUser.userId, authUser.campusId ?? null).catch(() => undefined);
    },
    [authUser?.campusId, authUser?.userId],
  );

  const handleNotificationSelect = useCallback(
    (entry: Notification) => {
      if (!authUser?.userId) {
        return;
      }
      if (!entry.read_at) {
        const now = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((item) => (item.id === entry.id ? { ...item, read_at: now } : item)),
        );
        setUnreadCount((prev) => Math.max(prev - 1, 0));
        void markNotificationRead(authUser.userId, authUser.campusId ?? null, entry.id).catch(() => undefined);
      }
      if (entry.link) {
        if (entry.link.startsWith("/")) {
          router.push(entry.link);
        } else {
          window.location.href = entry.link;
        }
        setPanelOpen(false);
      }
    },
    [authUser?.campusId, authUser?.userId, router],
  );

  useEffect(() => {
    if (!authUser?.userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const data = await loadProfile(authUser.userId, authUser.campusId ?? null);
        if (!cancelled) {
          setProfile(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load profile", err);
        }
      }
    };
    void run();
    const interval = window.setInterval(() => {
      if (!cancelled) {
        void run();
      }
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [authUser?.campusId, authUser?.userId, loadProfile]);

  useEffect(() => {
    if (!authUser?.userId) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationsError(null);
      return;
    }
    void loadNotifications(authUser.userId, authUser.campusId ?? null);
    void loadUnreadCount(authUser.userId, authUser.campusId ?? null);
  }, [authUser?.campusId, authUser?.userId, loadNotifications, loadUnreadCount]);

  useEffect(() => {
    if (!authUser?.userId) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadUnreadCount(authUser.userId, authUser.campusId ?? null);
    }, 30000);
    return () => {
      window.clearInterval(interval);
    };
  }, [authUser?.campusId, authUser?.userId, loadUnreadCount]);

  useEffect(() => {
    if (!authUser?.userId) {
      return;
    }
    const socket = getSocialSocket(authUser.userId, authUser.campusId ?? null);
    const handleNew = (payload: Notification) => {
      setNotifications((prev) => {
        const next = [payload, ...prev.filter((item) => item.id !== payload.id)];
        return next.slice(0, NOTIFICATIONS_LIMIT);
      });
      if (!payload.read_at) {
        setUnreadCount((prev) => prev + 1);
      }
    };
    const handleRead = (payload: { id?: string; all?: boolean }) => {
      const now = new Date().toISOString();
      if (payload.all) {
        setNotifications((prev) => prev.map((item) => ({ ...item, read_at: item.read_at || now })));
        setUnreadCount(0);
        return;
      }
      if (payload.id) {
        let updated = false;
        setNotifications((prev) =>
          prev.map((item) => {
            if (item.id === payload.id && !item.read_at) {
              updated = true;
              return { ...item, read_at: now };
            }
            return item;
          }),
        );
        if (updated) {
          setUnreadCount((prev) => Math.max(prev - 1, 0));
        }
      }
    };
    const handleInviteUpdate = () => {
      fetchInviteInbox(authUser.userId, authUser.campusId ?? null)
        .then((inbox) => setSocialRequestCount(inbox.length))
        .catch(() => { });
    };

    socket.on("notification:new", handleNew);
    socket.on("notification:read", handleRead);
    socket.on("invite:new", handleInviteUpdate);
    socket.on("invite:update", handleInviteUpdate);

    socket.emit("subscribe_self");
    return () => {
      socket.off("notification:new", handleNew);
      socket.off("notification:read", handleRead);
      socket.off("invite:new", handleInviteUpdate);
      socket.off("invite:update", handleInviteUpdate);
    };
  }, [authUser?.campusId, authUser?.userId]);

  useEffect(() => {
    if (!panelOpen || !authUser?.userId) {
      return;
    }
    void loadNotifications(authUser.userId, authUser.campusId ?? null, { silent: true });
  }, [authUser?.campusId, authUser?.userId, loadNotifications, panelOpen]);

  useEffect(() => {
    if (!panelOpen || !authUser?.userId) {
      return;
    }
    void markNotificationsRead(notifications);
  }, [authUser?.userId, markNotificationsRead, notifications, panelOpen]);

  useEffect(() => {
    if (!panelOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target) || bellRef.current?.contains(target)) {
        return;
      }
      setPanelOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [panelOpen]);

  useEffect(() => {
    setPanelOpen(false);
  }, [pathname]);

  const profileName =
    profile?.display_name || authUser?.displayName || authUser?.handle || authUser?.userId || "";
  const avatarUrl = profile?.avatar_url || authUser?.photoURL || null;
  const avatarInitials = getInitials(profileName || authUser?.userId || "");
  const unreadBadge = unreadCount > 99 ? "99+" : String(unreadCount);

  const [socialRequestCount, setSocialRequestCount] = useState(0);

  useEffect(() => {
    if (authUser?.userId) {
      fetchInviteInbox(authUser.userId, authUser.campusId ?? null)
        .then((inbox) => setSocialRequestCount(inbox.length))
        .catch(() => { });
    }
  }, [authUser?.userId, authUser?.campusId]);


  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo Area */}
        <div className="flex h-full items-center">
          <Link href="/" className="flex items-center gap-2">
            {/* Clean Logo without box */}
            <BrandLogo asLink={false} logoClassName="h-14 sm:h-16 w-auto" disableMixBlend={true} />
          </Link>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex absolute left-1/2 -translate-x-1/2">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => {
                if (link.label === "Meetups") markAsSeen();
              }}
              className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${activeMap[link.href]
                ? "bg-rose-50 text-rose-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
            >
              {link.label}
              {link.label === "Meetups" && hasNewMeetups && meetupNotifications.length > 0 && (
                <span className="flex items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-white">
                  {meetupNotifications.length}
                </span>
              )}
              {link.label === "Socials" && socialRequestCount > 0 && (
                <span className="flex items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-white">
                  {socialRequestCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Right Side / Profile */}
        <div className="flex items-center gap-3">
          {authUser?.userId ? (
            <>
              <button
                onClick={handleSignOut}
                className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
              <div className="relative">
                <button
                  ref={bellRef}
                  type="button"
                  onClick={() => setPanelOpen((prev) => !prev)}
                  aria-expanded={panelOpen}
                  aria-haspopup="dialog"
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 ? (
                    <span className="absolute -top-1 -right-1 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[0.65rem] font-semibold text-white shadow-sm">
                      {unreadBadge}
                    </span>
                  ) : null}
                </button>
                {panelOpen ? (
                  <div
                    ref={panelRef}
                    className="absolute right-0 mt-3 w-80 max-w-[90vw] rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
                    role="dialog"
                    aria-label="Notifications"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">Notifications</span>
                      {notificationsLoading ? (
                        <span className="text-xs text-slate-400">Updating...</span>
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                      {notificationsLoading ? (
                        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-6 text-xs text-slate-500">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
                          Loading notifications...
                        </div>
                      ) : notificationsError && notifications.length === 0 ? (
                        <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3 text-xs text-rose-600">
                          {notificationsError}
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                          No new notifications.
                        </div>
                      ) : (
                        notifications.map((entry) => {
                          const Icon = resolveNotificationIcon(entry.kind);
                          const summary =
                            entry.title?.trim() || entry.body?.trim() || entry.kind;
                          const unread = !entry.read_at;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => handleNotificationSelect(entry)}
                              className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left text-xs transition ${unread
                                ? "border-indigo-100 bg-indigo-50/70"
                                : "border-transparent hover:bg-slate-50"
                                }`}
                            >
                              <span
                                className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full ${unread ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                                  }`}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-slate-900">
                                  {summary}
                                </span>
                                <span className="block text-[0.7rem] text-slate-500">
                                  {formatRelativeTime(entry.created_at)}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <Link
                href="/settings/profile"
                className="relative h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-50 shadow-sm transition hover:border-slate-300"
                aria-label={profileName ? `${profileName} profile` : "Profile"}
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={profileName || "Profile avatar"}
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                    sizes="40px"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-600">
                    {avatarInitials}
                  </span>
                )}
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
