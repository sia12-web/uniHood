"use client";

import { useEffect } from "react";

import { connectPresenceSocket, disconnectPresenceSocket, getPresenceSocketInstance } from "@/app/lib/socket/presence";
import { readAuthUser } from "@/lib/auth-storage";
import { sendOffline } from "@/lib/presence/api";
import { markPresenceFromActivity } from "@/store/presence";

/**
 * useAutoLivePresence
 * Automatically connects the presence socket and emits a `presence_go_live` event
 * so the current user appears online while they have the site open.
 * Skips entirely when no authenticated user/campus is available.
 */
export function useAutoLivePresence(options?: { radiusM?: number }) {
  useEffect(() => {
    const authUser = readAuthUser();
    const userId = authUser?.userId ?? null;
    const campusId = authUser?.campusId ?? null;
    if (!userId || !campusId) {
      return;
    }

    // Connect (idempotent) — manager will reuse existing instance.
    connectPresenceSocket({ userId, campusId });
    const socket = getPresenceSocketInstance();
    const radius = Math.max(10, options?.radiusM ?? 30);
    let disposed = false;

    const emitGoLive = () => {
      if (!socket || disposed || !socket.connected) return;
      try {
        socket.emit("presence_go_live", { radius_m: radius });
        // Mark active immediately for UI (store auto-offlines after TTL)
        markPresenceFromActivity(userId, { lastSeen: new Date().toISOString(), ttlMs: 60_000 });
      } catch {
        // swallow
      }
    };

    // If already connected, emit immediately; else wait for connect.
    if (socket?.connected) {
      emitGoLive();
    } else if (socket) {
      socket.on("connect", emitGoLive);
      socket.on("sys.ok", emitGoLive); // defensive — namespace ack
    }

    // Cleanup: mark offline + disconnect socket (best-effort)
    const handleUnload = () => {
      if (disposed) return;
      disposed = true;
      void sendOffline(userId, campusId);
      try {
        disconnectPresenceSocket();
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      handleUnload();
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [options?.radiusM]);
}
