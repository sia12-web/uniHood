import "fastify";
import type { ServiceContainer } from "../dependencies";
import type { SessionSocketHub } from "../lib/socketHub";
import type { AuthenticatedRequest } from "../plugins/auth";

export interface RouteRateLimitConfig {
  limit: number;
  windowMs: number;
  key?: (request: import("fastify").FastifyRequest) => string;
}

declare module "fastify" {
  interface FastifyInstance {
    deps: ServiceContainer;
    sessionHub: SessionSocketHub;
  }

  interface FastifyRequest {
    auth?: AuthenticatedRequest;
  }

  interface RouteConfig {
    rateLimit?: RouteRateLimitConfig;
  }
}
