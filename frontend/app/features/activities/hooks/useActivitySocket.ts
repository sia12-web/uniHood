import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export function useActivitySocket(activityId: string | null, onEvent: () => void) {
  useEffect(() => {
    if (!activityId) return;
    const socket = getSocket();
    if (!socket) return;

    const handler = (data: { id?: string; activity_id?: string }) => {
      if (data.id === activityId || data.activity_id === activityId) {
        onEvent();
      }
    };

    socket.on("activity_state", handler);
    socket.on("round_open", handler);
    socket.on("activity_started", handler);

    return () => {
      socket.off("activity_state", handler);
      socket.off("round_open", handler);
      socket.off("activity_started", handler);
    };
  }, [activityId, onEvent]);
}
