"use client";

import { forwardRef } from "react";
import clsx from "clsx";

import type { NotificationRecord } from "@/lib/notifications";

import {
  buildNotificationMessage,
  buildNotificationTitle,
  formatNotificationTime,
  getInitialsFromActor,
} from "./utils";

export type NotificationItemProps = {
  notification: NotificationRecord;
  onSelect?: (notification: NotificationRecord) => void;
  onMarkRead?: (notification: NotificationRecord) => void;
  isActive?: boolean;
};

export const NotificationItem = forwardRef<HTMLButtonElement, NotificationItemProps>(function NotificationItem(
  { notification, onSelect, onMarkRead, isActive = false },
  ref,
) {
  const unread = !notification.is_read;
  const title = buildNotificationTitle(notification);
  const message = buildNotificationMessage(notification);
  const createdLabel = formatNotificationTime(notification.created_at);
  const initials = getInitialsFromActor(notification.actor);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(notification)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onSelect) {
          event.preventDefault();
          onSelect(notification);
        }
        if ((event.key === "Delete" || event.key === "Backspace") && unread && onMarkRead) {
          event.preventDefault();
          onMarkRead(notification);
        }
      }}
      ref={ref}
      className={clsx(
        "group flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight",
        unread ? "bg-slate-50 hover:bg-slate-100" : "hover:bg-slate-50",
        isActive ? "ring-2 ring-midnight/60" : ""
      )}
    >
      <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
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
        {unread ? <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-blue-500" aria-hidden /> : null}
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800 line-clamp-2">{title}</span>
          {createdLabel ? <span className="text-xs text-slate-400 whitespace-nowrap">{createdLabel}</span> : null}
        </span>
        <span className="text-xs text-slate-500 line-clamp-3">{message}</span>
        {unread && onMarkRead ? (
          <span className="text-xs font-medium text-blue-600 opacity-0 transition group-hover:opacity-100">
            Press Delete to mark as read
          </span>
        ) : null}
      </span>
    </button>
  );
});
