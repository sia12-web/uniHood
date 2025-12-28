"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { readAuthUser } from "@/lib/auth-storage";
import { getSocialSocket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@/lib/types";

export function SocialNotifications() {
    const { push } = useToast();
    const queryClient = useQueryClient();
    const socketRef = useRef<unknown>(null);

    useEffect(() => {
        const authUser = readAuthUser();
        if (!authUser?.userId) return;

        // Connect/Get socket
        const socket = getSocialSocket(authUser.userId, authUser.campusId);
        socketRef.current = socket;

        const handleNotification = (payload: Notification) => {
            // payload matches Notification struct from backend
            // { id, title, body, kind, link, ... }

            push({
                title: payload.title,
                description: payload.body,
                variant: "default",
                duration: 5000,
            });

            // Invalidate relevant queries based on kind
            if (payload.kind === "friend_request" || payload.kind === "friend_accepted") {
                queryClient.invalidateQueries({ queryKey: ["friends"] });
                queryClient.invalidateQueries({ queryKey: ["requests"] });
                // Also trigger refresh for useInviteInboxCount if it listens to window events
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new Event("divan:invites:refresh"));
                }
            } else if (payload.kind.startsWith("meetup")) {
                queryClient.invalidateQueries({ queryKey: ["meetups"] });
            }
        };

        socket.on("notification:new", handleNotification);

        // Also listen for direct invite events if notification service fails or is delayed?
        // Actually notification service is called BY the actions, so it should be enough.
        // But invite:new is emitted separately in backend service.
        // Let's listen to invite:new too just in case, but usually invite:new payload is the invite summary, not a notification object.
        // If we listen to both, we might get double toasts if we implement logic for both.
        // The backend `send_invite` calls `_emit_invite_new` AND `NotificationService().notify_user`.
        // The `NotificationService` emits `notification:new`.
        // So if we listen to `notification:new`, we get the toast.
        // `invite:new` is for data updates (handled by other hooks).

        return () => {
            socket.off("notification:new", handleNotification);
        };
    }, [push, queryClient]);

    return null;
}
