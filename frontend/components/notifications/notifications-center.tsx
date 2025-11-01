"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

import { useNotificationsList } from "@/hooks/notifications/use-list";
import { useMarkAllNotificationsRead, useMarkNotificationRead } from "@/hooks/notifications/use-mark-read";
import { useUnreadNotificationsCount } from "@/hooks/notifications/use-unread-count";
import { useNotificationsSocketBridge } from "@/hooks/notifications/use-notifications-socket";
import type { NotificationRecord } from "@/lib/notifications";

import { NotificationsEmpty } from "./empty";
import { NotificationRow } from "./notification-row";

export function NotificationsCenter() {
  const { items, isLoading, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage, isFetching } = useNotificationsList();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unreadQuery = useUnreadNotificationsCount();
  useNotificationsSocketBridge();

  const unreadCount = unreadQuery.data ?? 0;
  const router = useRouter();

  const badge = useMemo(() => {
    if (!unreadCount) {
      return null;
    }
    if (unreadCount > 99) {
      return "99+";
    }
    return String(unreadCount);
  }, [unreadCount]);

  const handleNavigate = useCallback(
    (href: string, notification: NotificationRecord) => {
      if (!notification.is_read) {
        markOne.mutate(notification.id);
      }
      router.push(href);
    },
    [markOne, router],
  );

  const handleMarkRead = useCallback(
    (notification: NotificationRecord) => {
      if (!notification.is_read) {
        markOne.mutate(notification.id);
      }
    },
    [markOne],
  );

  const sectionTitle = unreadCount > 0 ? `Notifications (${unreadCount})` : "Notifications";

  if (isLoading && items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading your recent notifications…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-semibold">We ran into an issue loading notifications.</p>
        <p className="text-red-600">{error instanceof Error ? error.message : "Please try again."}</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
            {badge ? (
              <span className="inline-flex items-center justify-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                {badge}
              </span>
            ) : null}
          </div>
        </div>
        <NotificationsEmpty message="Once people start engaging with your posts, updates will appear here." />
      </div>
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="notifications-center-heading">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="notifications-center-heading" className="text-2xl font-semibold text-slate-900">
            {sectionTitle}
          </h1>
          <p className="text-sm text-slate-600">Realtime updates stream in automatically—no refresh needed.</p>
        </div>
        <div className="flex items-center gap-2">
          {badge ? (
            <span className="inline-flex items-center justify-center rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
              {badge} unread
            </span>
          ) : (
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">All caught up</span>
          )}
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-midnight transition hover:border-midnight hover:bg-midnight hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:cursor-not-allowed disabled:opacity-70"
            >
              {markAll.isPending ? "Marking…" : "Mark all as read"}
            </button>
          ) : null}
        </div>
      </header>

      <ul className="flex flex-col gap-3" role="list">
        {items.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onNavigate={handleNavigate}
            onMarkRead={handleMarkRead}
            disableActions={markAll.isPending || markOne.isPending}
          />
        ))}
      </ul>

      {hasNextPage ? (
        <div className="flex items-center justify-center pt-2">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-midnight hover:text-midnight disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      {isFetching && !isFetchingNextPage ? (
        <p className="text-center text-xs text-slate-400">Updating…</p>
      ) : null}
    </section>
  );
}
