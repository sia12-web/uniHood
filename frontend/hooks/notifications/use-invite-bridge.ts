"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";

import { useToast } from "@/hooks/use-toast";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { getSocialSocket } from "@/lib/socket";
import type { InviteSummary } from "@/lib/types";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import type { NotificationListResponse, NotificationRecord } from "@/lib/notifications";

import {
  NOTIFICATIONS_DROPDOWN_KEY,
  NOTIFICATIONS_LIST_KEY,
  NOTIFICATIONS_UNREAD_KEY,
} from "./keys";

type InviteIdentity = {
  userId: string;
  campusId: string | null;
};

const INVITE_LISTENER_COUNT_KEY = "__inviteNotificationBridgeCount";

function resolveIdentity(auth: AuthUser | null): InviteIdentity {
  if (auth?.userId) {
    return {
      userId: auth.userId,
      campusId: auth.campusId ?? getDemoCampusId(),
    };
  }
  return {
    userId: getDemoUserId(),
    campusId: getDemoCampusId(),
  };
}

export function createInviteNotificationRecord(invite: InviteSummary): NotificationRecord {
  const actorDisplay = invite.from_display_name?.trim() || null;
  const actorHandle = invite.from_handle?.trim() || null;
  const actorName = actorDisplay || actorHandle || "Someone nearby";
  const expiresSoon = invite.expires_at ? " before it expires" : "";

  return {
    id: `social-invite-${invite.id}`,
    created_at: invite.created_at,
    is_read: false,
    actor: {
      id: invite.from_user_id,
      display_name: invite.from_display_name ?? undefined,
      handle: invite.from_handle ?? undefined,
    },
    entity: {
      type: "social.invite.received",
      ref_id: invite.id,
    },
    title: `${actorName} sent you an invite`,
    message: `Open your invites to respond${expiresSoon}.`,
    verb: "sent you an invite",
    target_url: "/invites",
  };
}

export function useInviteNotificationBridge(): void {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [identity, setIdentity] = useState<InviteIdentity>(() => resolveIdentity(readAuthUser()));
  const lastToastRef = useRef(0);

  useEffect(() => {
    setIdentity(resolveIdentity(readAuthUser()));
    const unsubscribe = onAuthChange(() => {
      setIdentity(resolveIdentity(readAuthUser()));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const { userId, campusId } = identity;
    if (!userId) {
      return;
    }

    const socket = getSocialSocket(userId, campusId);
    const socketAny = socket as unknown as Record<string, unknown>;

    const handleInvite = (invite: InviteSummary) => {
      const notification = createInviteNotificationRecord(invite);
      let alreadyPresent = false;

      queryClient.setQueryData<NotificationRecord[] | undefined>(NOTIFICATIONS_DROPDOWN_KEY, (current) => {
        const base = current ?? [];
        const filtered = base.filter((item) => {
          if (item.id === notification.id) {
            alreadyPresent = true;
            return false;
          }
          return true;
        });
        return [notification, ...filtered].slice(0, 15);
      });

      queryClient.setQueryData<InfiniteData<NotificationListResponse> | undefined>(NOTIFICATIONS_LIST_KEY, (current) => {
        if (!current) {
          return {
            pages: [{ items: [notification], next_cursor: null }],
            pageParams: [undefined],
          } as InfiniteData<NotificationListResponse>;
        }
        return {
          ...current,
          pages: current.pages.map((page, index) => {
            if (index !== 0) {
              return page;
            }
            const filtered = page.items.filter((item) => item.id !== notification.id);
          return {
              ...page,
              items: [notification, ...filtered],
            };
          }),
        };
      });

      if (!alreadyPresent) {
        queryClient.setQueryData<number | undefined>(NOTIFICATIONS_UNREAD_KEY, (current) => (current ?? 0) + 1);
      }

      const actorName = notification.actor?.display_name || notification.actor?.handle;
      const now = Date.now();
      if (now - lastToastRef.current > 6_000) {
        lastToastRef.current = now;
        push({
          title: actorName ? `${actorName} invited you` : "New invite received",
          description: "Check your invites to accept or decline.",
        });
      }
    };

    const currentCount = (socketAny[INVITE_LISTENER_COUNT_KEY] as number | undefined) ?? 0;
    socketAny[INVITE_LISTENER_COUNT_KEY] = currentCount + 1;
    if (currentCount === 0) {
      socket.on("invite:new", handleInvite);
      socket.emit("subscribe_self");
    }

    return () => {
      const count = (socketAny[INVITE_LISTENER_COUNT_KEY] as number | undefined) ?? 1;
      const nextCount = Math.max(0, count - 1);
      if (nextCount === 0) {
        socket.off("invite:new", handleInvite);
        delete socketAny[INVITE_LISTENER_COUNT_KEY];
      } else {
        socketAny[INVITE_LISTENER_COUNT_KEY] = nextCount;
      }
    };
  }, [identity, push, queryClient]);
}
