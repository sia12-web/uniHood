import { createClient, RedisClientType } from "redis";

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (client) {
    return client;
  }

  const url = process.env.REDIS_URL ?? "redis://localhost:6379/0";
  client = createClient({ url });

  client.on("error", (error: unknown) => {
    console.error("Redis client error", error);
  });

  await client.connect();
  return client;
}
