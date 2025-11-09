type EventName =
  | "activity.session.created"
  | "activity.session.started"
  | "activity.round.started"
  | "activity.round.ended"
  | "activity.session.ended"
  | "activity.score.updated"
  | "activity.anti_cheat.flag"
  | "activity.penalty.applied"
  | "activity.session.presence"
  | "activity.session.countdown"
  | "activity.session.countdown.cancelled";

export interface EventEnvelope<T = unknown> {
  name: EventName;
  payload: T;
}

export interface EventPublisher {
  publish: <T>(event: EventEnvelope<T>) => Promise<void>;
}

export function createNoopPublisher(): EventPublisher {
  return {
    async publish(event) {
      // TODO: integrate actual event bus (Redis pub/sub or internal emitter)
      console.debug("events::publish (noop)", event);
    },
  };
}
