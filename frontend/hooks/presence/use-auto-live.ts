"use client";

import { useEffect } from "react";
import { connectPresenceSocket, disconnectPresenceSocket, getPresenceSocketInstance } from "@/app/lib/socket/presence";
import { readAuthUser, readAuthSnapshot } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId, getDemoLatitude, getDemoLongitude } from "@/lib/env";
import { markPresenceFromActivity } from "@/store/presence";
import { sendOffline } from "@/lib/presence/api";

/**
 * useAutoLivePresence
 * Automatically connects the presence socket and emits a `presence_go_live` event
 * so the current user appears online while they have the site open.
 * Falls back to demo identifiers & coordinates if auth is not ready yet.
 */
export function useAutoLivePresence(options?: { radiusM?: number }) {
  useEffect(() => {
    const authUser = readAuthUser();
    const snapshot = readAuthSnapshot(); // future token use if ticket unavailable
    const userId = authUser?.userId || getDemoUserId();
    const campusId = authUser?.campusId || getDemoCampusId();
    if (!userId) {
      return;
    }
    // Connect (idempotent) – manager will reuse existing instance.
    connectPresenceSocket({ userId, campusId });
    const socket = getPresenceSocketInstance();
    const radius = Math.max(10, options?.radiusM ?? 30);
    let disposed = false;

    const emitGoLive = () => {
      if (!socket || disposed || !socket.connected) return;
      const lat = getDemoLatitude();
      const lon = getDemoLongitude();
      try {
        socket.emit("presence_go_live", { lat, lon, radius_m: radius });
        // Mark active immediately for UI (store auto-offlines after TTL)
        markPresenceFromActivity(userId, { lastSeen: new Date().toISOString(), ttlMs: 60_000 });
      } catch (e) {
        // swallow
      }
    };

    // If already connected, emit immediately; else wait for connect.
    if (socket?.connected) {
      emitGoLive();
    } else if (socket) {
      socket.on("connect", emitGoLive);
      socket.on("sys.ok", emitGoLive); // defensive – namespace ack
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
