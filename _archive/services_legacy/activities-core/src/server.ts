import 'dotenv/config';
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { registerAuthPlugin } from "./plugins/auth";
import { registerRateLimitPlugin } from "./plugins/rateLimit";
import { registerSessionRoutes } from "./routes/sessionRoutes";
import { registerSessionStream } from "./ws/sessionStream";
import { createServiceContainer } from "./dependencies";
import { SessionSocketHub } from "./lib/socketHub";

export async function buildServer() {
  const server = Fastify({
    logger: true,
  });

  const sessionHub = new SessionSocketHub();
  const deps = await createServiceContainer(sessionHub, server.log);

  server.decorate("sessionHub", sessionHub);
  server.decorate("deps", deps);

  // Configure CORS with secure defaults; allow explicit origins via CORS_ORIGIN env (comma-separated)
  const corsEnv = process.env.CORS_ORIGIN?.trim();
  const origin = corsEnv
    ? corsEnv.split(",").map((v) => v.trim()).filter((v) => v.length > 0)
    : true; // in dev default to true; set CORS_ORIGIN for stricter control

  await server.register(cors, {
    origin,
    credentials: true,
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Accept",
      "X-Requested-With",
      // Custom headers the frontend sends with resolveAuthHeaders
      "X-Request-Id",
      "X-Idempotency-Key",
      "X-User-Id",
      "X-Campus-Id",
      "X-Session-Id",
      "X-User-Handle",
      "X-User-Name",
      "X-User-Roles",
    ],
    methods: ["GET", "POST", "OPTIONS"],
  });

  await server.register(websocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  await registerAuthPlugin(server);
  await registerRateLimitPlugin(server);
  await registerSessionRoutes(server);
  await registerSessionStream(server);

  server.addHook("onClose", async () => {
    await Promise.allSettled([
      deps.redis.quit(),
      deps.prisma.$disconnect(),
    ]);
  });

  return server;
}

export async function startServer() {
  const server = await buildServer();
  const port = Number(process.env.PORT ?? 4005);
  await server.listen({ host: "0.0.0.0", port });
  server.log.info({ port }, "activities-core server listening");
  return server;
}
