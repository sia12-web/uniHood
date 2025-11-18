import { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { RedisClientType } from "redis";
import { getRedisClient } from "./lib/redis";
import { createRateLimiter, SlidingWindowLimiter } from "./lib/rateLimiter";
import { createTimerScheduler, TimerScheduler } from "./lib/timers";
import { SessionSocketHub } from "./lib/socketHub";
import { createSocketEventPublisher } from "./lib/publisher";
import { EventPublisher } from "./lib/events";
import { createSpeedTypingService, SpeedTypingService } from "./services/speedTyping";
import { createQuickTriviaService, QuickTriviaService } from "./services/quickTrivia";

export interface ServiceContainer {
  prisma: PrismaClient;
  redis: RedisClientType;
  limiter: SlidingWindowLimiter;
  scheduler: TimerScheduler;
  publisher: EventPublisher;
  speedTyping: SpeedTypingService;
  quickTrivia: QuickTriviaService;
}

export async function createServiceContainer(
  hub: SessionSocketHub,
  logger?: FastifyBaseLogger,
): Promise<ServiceContainer> {
  const prisma = new PrismaClient();
  const redis = await getRedisClient();
  const limiter = await createRateLimiter(redis);
  const scheduler = createTimerScheduler();
  const publisher = createSocketEventPublisher(hub, logger);

  const speedTyping = createSpeedTypingService({ prisma, redis, limiter, publisher, scheduler });
  const quickTrivia = createQuickTriviaService({ prisma, redis, limiter, publisher, scheduler });

  // multiplex scheduler callback to both services; each will no-op if not applicable
  scheduler.setCallback(async (sessionId, roundIndex) => {
    await Promise.allSettled([
      speedTyping.handleTimerElapsed(sessionId, roundIndex),
      quickTrivia.handleTimerElapsed(sessionId, roundIndex),
    ]);
  });

  return {
    prisma,
    redis,
    limiter,
    scheduler,
    publisher,
    speedTyping,
    quickTrivia,
  };
}
