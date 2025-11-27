import { useEffect } from "react";
// import { getSocket } from "@/lib/socket"; // getSocket does not exist

export function useActivitySocket(activityId: string | null, onEvent: () => void) {
  useEffect(() => {
    if (!activityId) return;
    // TODO: Replace with valid socket instance if available
    return;

    // TODO: Add handler logic when socket is available

    // TODO: Add socket event listeners when a valid socket instance is available
    return;
  }, [activityId, onEvent]);
}
