"use client";

import { memo } from "react";
import Link from "next/link";
import clsx from "clsx";

import type { NotificationRecord } from "@/lib/notifications";

import {
  buildNotificationHref,
  buildNotificationMessage,
  buildNotificationTitle,
  formatNotificationTime,
  getInitialsFromActor,
} from "./utils";

type NotificationRowProps = {
  notification: NotificationRecord;
  onNavigate?: (href: string, notification: NotificationRecord) => void;
  onMarkRead?: (notification: NotificationRecord) => void;
  disableActions?: boolean;
};

export const NotificationRow = memo(function NotificationRow({
  notification,
  onNavigate,
  onMarkRead,
  disableActions = false,
}: NotificationRowProps) {
  const unread = !notification.is_read;
  const title = buildNotificationTitle(notification);
  const message = buildNotificationMessage(notification);
  const href = buildNotificationHref(notification);
  const createdLabel = formatNotificationTime(notification.created_at);
  const initials = getInitialsFromActor(notification.actor);

  return (
    <li className={clsx("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition", unread ? "ring-1 ring-blue-100" : "")}
        data-testid="notification-row">
      <div className="flex items-start gap-3">
        <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
          {notification.actor?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={notification.actor.avatar_url}
              alt={notification.actor.display_name ?? notification.actor.handle ?? "Notification avatar"}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials || "?"
          )}
          {unread ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-blue-500" aria-hidden /> : null}
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-600">{message}</p>
            </div>
            {createdLabel ? <time className="shrink-0 text-xs text-slate-400">{createdLabel}</time> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={href}
              onClick={(event) => {
                if (disableActions) {
                  event.preventDefault();
                  return;
                }
                if (onNavigate) {
                  event.preventDefault();
                  onNavigate(href, notification);
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-midnight transition hover:border-midnight hover:bg-midnight hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              View update
            </Link>
            {unread && onMarkRead ? (
              <button
                type="button"
                onClick={() => {
                  if (!disableActions) {
                    onMarkRead(notification);
                  }
                }}
                disabled={disableActions}
                className="inline-flex items-center gap-2 rounded-full border border-transparent bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark as read
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
});
