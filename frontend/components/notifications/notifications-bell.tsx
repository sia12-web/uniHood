"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import type { NotificationRecord } from "@/lib/notifications";
import { useNotificationsDropdown } from "@/hooks/notifications/use-dropdown";
import { useNotificationsSocketBridge } from "@/hooks/notifications/use-notifications-socket";

import { NotificationsEmpty } from "./empty";
import { NotificationItem } from "./notification-item";
import { buildNotificationHref } from "./utils";

const BADGE_MAX = 99;

export function NotificationsBell() {
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    error,
    markOne,
    markAll,
    refetch,
  } = useNotificationsDropdown();
  useNotificationsSocketBridge();

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const router = useRouter();

  const badgeLabel = useMemo(() => {
    if (!unreadCount) {
      return null;
    }
    if (unreadCount > BADGE_MAX) {
      return `${BADGE_MAX}+`;
    }
    return String(unreadCount);
  }, [unreadCount]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      buttonRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const focusItem = useCallback(
    (index: number) => {
      if (!panelRef.current || notifications.length === 0) {
        return;
      }
      const clamped = Math.max(0, Math.min(index, notifications.length - 1));
      setActiveIndex(clamped);
      requestAnimationFrame(() => {
        itemRefs.current[clamped]?.focus({ preventScroll: true });
      });
    },
    [notifications.length],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    focusItem(0);
  }, [open, focusItem]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (!panelRef.current || panelRef.current.contains(event.target as Node) || buttonRef.current?.contains(event.target as Node)) {
        return;
      }
      closeDropdown();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeDropdown, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      event.preventDefault();
      const nextIndex = event.shiftKey ? activeIndex - 1 : activeIndex + 1;
      focusItem((nextIndex + notifications.length) % Math.max(1, notifications.length));
    };
    document.addEventListener("keydown", handleTab, true);
    return () => {
      document.removeEventListener("keydown", handleTab, true);
    };
  }, [activeIndex, focusItem, notifications.length, open]);

  useEffect(() => {
    if (!buttonRef.current) {
      return;
    }
    buttonRef.current.setAttribute("aria-expanded", open ? "true" : "false");
  }, [open]);

  const handleToggle = useCallback(() => {
    if (open) {
      closeDropdown();
    } else {
      setOpen(true);
    }
  }, [closeDropdown, open]);

  const handleSelect = useCallback(
    (notification: NotificationRecord) => {
      if (!notification.is_read) {
        markOne.mutate(notification.id);
      }
      const href = buildNotificationHref(notification);
      setOpen(false);
      router.push(href);
    },
    [markOne, router]
  );

  const handleMarkRead = useCallback(
    (notification: NotificationRecord) => {
      if (!notification.is_read) {
        markOne.mutate(notification.id);
      }
    },
    [markOne]
  );

  const dropdownContent = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-10 text-sm text-slate-500">
          Loading notifications…
        </div>
      );
    }
    if (isError) {
      return (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-red-600">
          <p className="font-semibold">We could not load notifications.</p>
          <button
            type="button"
            className="rounded-full border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            onClick={() => refetch()}
          >
            Retry
          </button>
          <p className="text-xs text-red-500">
            {error instanceof Error ? error.message : "Try again in a moment."}
          </p>
        </div>
      );
    }
    if (!notifications.length) {
      return <NotificationsEmpty message="Stay tuned for upcoming activity." />;
    }
    return (
      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto py-1">
        {notifications.map((notification, index) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onSelect={handleSelect}
            onMarkRead={handleMarkRead}
            isActive={index === activeIndex}
            ref={(element: HTMLButtonElement | null) => {
              itemRefs.current[index] = element;
            }}
          />
        ))}
      </div>
    );
  }, [activeIndex, error, handleMarkRead, handleSelect, isError, isLoading, notifications, refetch]);

  return (
    <div className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-controls="notifications-dropdown"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-midnight hover:text-midnight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
      >
        <span className="sr-only">{open ? "Close notifications" : "Open notifications"}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 0 0-5-5.917V5a1 1 0 0 0-2 0v.083A6 6 0 0 0 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
          />
        </svg>
        {badgeLabel ? (
          <span className="absolute -top-1 -right-1 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white shadow-sm" aria-label={`${unreadCount} unread notifications`}>
            {badgeLabel}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id="notifications-dropdown"
          role="dialog"
          aria-modal="true"
          ref={panelRef}
          className="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <header className="flex items-center justify-between gap-2 px-2 py-1">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className={clsx(
                    "text-xs font-semibold text-blue-600 transition",
                    markAll.isPending ? "opacity-60" : "hover:underline"
                  )}
                >
                  Mark all as read
                </button>
              ) : null}
              <Link
                href="/communities/notifications"
                className="text-xs font-semibold text-slate-500 transition hover:text-midnight"
                onClick={() => setOpen(false)}
              >
                View all
              </Link>
            </div>
          </header>
          <div className="border-t border-slate-200" />
          {dropdownContent}
        </div>
      ) : null}
    </div>
  );
}
