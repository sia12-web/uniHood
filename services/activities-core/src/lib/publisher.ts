import { EventEnvelope, EventPublisher } from "./events";
import { SessionSocketHub } from "./socketHub";

export function createSocketEventPublisher(hub: SessionSocketHub): EventPublisher {
  return {
    async publish<T>(event: EventEnvelope<T>) {
      const payload = event.payload as Record<string, unknown> | undefined;
      const sessionId = payload && typeof payload === "object" ? (payload.sessionId as string | undefined) : undefined;
      if (!sessionId) {
        return;
      }
      await hub.publish(sessionId, { type: event.name, payload: event.payload });
    },
  };
}
