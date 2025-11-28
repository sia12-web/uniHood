import type { RedisClientType } from "redis";
import { getRedisClient } from "./redis";

export class RateLimitExceededError extends Error {
  constructor(message = "rate_limit_exceeded") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export interface SlidingWindowLimiter {
  check: (key: string, limit: number, windowMs: number) => Promise<void>;
}

export async function createRateLimiter(providedRedis?: RedisClientType): Promise<SlidingWindowLimiter> {
  const redis: RedisClientType = providedRedis ?? (await getRedisClient());

  return {
    async check(key: string, limit: number, windowMs: number) {
      const now = Date.now();
      const windowStart = now - windowMs;
      const redisKey = `rate:${key}`;
      const member = `${now}-${Math.random()}`;

  const pipeline = redis.multi();
  // Update Redis v4 command casing
  pipeline.zRemRangeByScore(redisKey, 0, windowStart);
  pipeline.zAdd(redisKey, { score: now, value: member });
  pipeline.zCard(redisKey);
  pipeline.expire(redisKey, Math.ceil(windowMs / 1000) + 1);
  const [, , countResult] = (await pipeline.exec()) ?? [];

      const count = Array.isArray(countResult) ? Number(countResult[1]) : Number(countResult);
      if (Number.isNaN(count)) {
        return;
      }
      if (count > limit) {
        throw new RateLimitExceededError();
      }
    },
  };
}
