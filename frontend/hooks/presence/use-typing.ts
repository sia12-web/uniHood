"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCommunitiesSocket } from "@/components/providers/socket-provider";

const TTL = 5_000;
const START_THROTTLE = 1_500;

type TypingPayload = {
  user_id: string;
  scope_id: string;
  on?: boolean;
  status?: "start" | "stop";
};

type TypingHookParams = {
  scope: "post" | "group";
  id: string;
  currentUserId: string;
};

export function useTyping({ scope, id, currentUserId }: TypingHookParams) {
  const socket = useCommunitiesSocket();
  const [typingMap, setTypingMap] = useState<Record<string, number>>({});
  const lastSentRef = useRef<number>(0);

  const channel = scope === "post" ? "post:typing" : "group:typing";

  useEffect(() => {
    if (!socket || !id) {
      return;
    }

    const handleTyping = (payload: TypingPayload) => {
      if (!payload || payload.user_id === currentUserId) {
        return;
      }
      if (payload.scope_id !== id) {
        return;
      }
      const isTyping = payload.on ?? payload.status === "start";
      setTypingMap((prev) => {
        const next = { ...prev };
        if (isTyping) {
          next[payload.user_id] = Date.now() + TTL;
        } else {
          delete next[payload.user_id];
        }
        return next;
      });
    };

    socket.on(channel, handleTyping);

    return () => {
      socket.off(channel, handleTyping);
    };
  }, [channel, currentUserId, id, socket]);

  useEffect(() => {
    if (Object.keys(typingMap).length === 0) {
      return;
    }
    const interval = window.setInterval(() => {
      const now = Date.now();
      setTypingMap((prev) => {
        const next: Record<string, number> = {};
        let changed = false;
        Object.entries(prev).forEach(([userId, expiry]) => {
          if (expiry > now) {
            next[userId] = expiry;
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [typingMap]);

  const emit = useCallback(
    (status: "start" | "stop") => {
      if (!socket || !id) {
        return;
      }
      const event = `${channel}:${status}`;
      if (scope === "post") {
        socket.emit(event, { postId: id });
      } else {
        socket.emit(event, { groupId: id });
      }
    },
    [channel, id, scope, socket],
  );

  const startTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < START_THROTTLE) {
      return;
    }
    lastSentRef.current = now;
    emit("start");
  }, [emit]);

  const stopTyping = useCallback(() => {
    emit("stop");
  }, [emit]);

  const typingUsers = useMemo(() => Object.keys(typingMap).filter(Boolean), [typingMap]);

  return {
    typingUsers,
    startTyping,
    stopTyping,
  };
}
