import type { FastifyBaseLogger } from "fastify";
import { EventEnvelope, EventPublisher } from "./events";
import { SessionSocketHub } from "./socketHub";

export function createSocketEventPublisher(
  hub: SessionSocketHub,
  logger?: FastifyBaseLogger,
): EventPublisher {
  return {
    async publish<T>(event: EventEnvelope<T>) {
      const payload = event.payload as Record<string, unknown> | undefined;
      const sessionId = payload && typeof payload === "object" ? (payload.sessionId as string | undefined) : undefined;
      if (!sessionId) {
        return;
      }
      if (logger) {
        // Emit compact, targeted fields for easier filtering in dev logs
        if (event.name === "activity.session.presence") {
          const participants = Array.isArray((payload as any)?.participants) ? (payload as any).participants : [];
          const readyCount = participants.filter((p: any) => p?.ready).length;
          const total = participants.length || undefined;
          logger.info({ event: event.name, sessionId, lobbyReady: (payload as any)?.lobbyReady, readyCount, total }, "activity event published");
        } else if (event.name === "activity.session.countdown") {
          logger.info({ event: event.name, sessionId, reason: (payload as any)?.reason, nextRoundIndex: (payload as any)?.nextRoundIndex }, "activity event published");
        } else {
          logger.info({ event: event.name, sessionId }, "activity event published");
        }
      }
      await hub.publish(sessionId, { type: event.name, payload: event.payload });
    },
  };
}
