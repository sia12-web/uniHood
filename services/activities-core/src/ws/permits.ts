import type { RedisClientType } from "redis";

const PERMIT_TTL_SECONDS = 60;

export function sessionPermitKey(sessionId: string, userId: string): string {
  return `sess:${sessionId}:permit:${userId}`;
}

export async function grantSessionPermit(
  redis: RedisClientType,
  sessionId: string,
  userId: string,
): Promise<void> {
  const key = sessionPermitKey(sessionId, userId);
  await redis.set(key, "1", { EX: PERMIT_TTL_SECONDS });
}

export async function consumeSessionPermit(
  redis: RedisClientType,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const key = sessionPermitKey(sessionId, userId);
  const permitted = await redis.get(key);
  if (!permitted) {
    return false;
  }
  await redis.del(key);
  return true;
}

export function permitTtlSeconds(): number {
  return PERMIT_TTL_SECONDS;
}
