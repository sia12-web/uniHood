import Fastify from "fastify";
import websocket from "@fastify/websocket";
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
  const deps = await createServiceContainer(sessionHub);

  server.decorate("sessionHub", sessionHub);
  server.decorate("deps", deps);

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
