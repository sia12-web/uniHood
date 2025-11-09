import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import type { RouteRateLimitConfig } from "../types/fastify";

const rateLimitPlugin: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  fastify.addHook("preHandler", async (request: FastifyRequest) => {
    const limiter = fastify.deps?.limiter;
    if (!limiter) {
      return;
    }

    const config = request.routeOptions.config as { rateLimit?: RouteRateLimitConfig } | undefined;
    const rateLimit = config?.rateLimit;
    if (!rateLimit) {
      return;
    }

    const key = rateLimit.key ? rateLimit.key(request) : `${request.auth?.userId ?? "anon"}:${request.routerPath ?? request.url}`;

    try {
      await limiter.check(key, rateLimit.limit, rateLimit.windowMs);
    } catch (error) {
      request.log.warn({ key }, "rate limit exceeded");
      // Fallback to standard error to avoid dependency on httpErrors plugin variant
      const err = new Error("rate_limit_exceeded");
      // @ts-ignore augment statusCode for Fastify reply handler
      err.statusCode = 429;
      throw err;
    }
  });
};

export async function registerRateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimitPlugin);
}
