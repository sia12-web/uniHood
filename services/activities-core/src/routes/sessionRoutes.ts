import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createSessionDto,
  createQuickTriviaSessionDto,
  joinSessionDto,
  leaveSessionDto,
  readyStateDto,
} from "../dto/sessionDtos";
import { RateLimitExceededError } from "../lib/rateLimiter";
import { grantSessionPermit, permitTtlSeconds } from "../ws/permits";

type KnownErrorCode =
  | "unsupported_activity"
  | "invalid_participants"
  | "session_not_found"
  | "session_not_in_lobby"
  | "round_not_started"
  | "round_not_found"
  | "forbidden"
  | "rate_limit_error"
  | "rate_limit_exceeded"
  | "participant_not_in_session";

function respondWithError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof RateLimitExceededError) {
    return reply.status(429).send({ error: "rate_limit_exceeded" satisfies KnownErrorCode });
  }

  if (error instanceof Error) {
    const message = error.message as KnownErrorCode | string;
    switch (true) {
      case message.startsWith("session_state_missing"):
        return reply.status(410).send({ error: "session_state_missing" });
      case message === "unsupported_activity":
      case message === "invalid_participants":
      case message === "round_not_started":
      case message === "round_not_found":
        return reply.status(400).send({ error: message });
      case message === "session_not_in_lobby":
        return reply.status(409).send({ error: message });
      case message === "forbidden":
        return reply.status(403).send({ error: message });
      case message === "participant_not_in_session":
        return reply.status(403).send({ error: message });
      case message === "session_not_found":
        return reply.status(404).send({ error: message });
      case message === "rate_limit_error":
      case message === "rate_limit_exceeded":
        return reply.status(429).send({ error: message });
      default:
        return reply.status(500).send({ error: "internal_error", details: message });
    }
  }

  return reply.status(500).send({ error: "unknown_error" });
}

async function resolveSessionOwner(
  app: FastifyInstance,
  sessionId: string,
): Promise<"speed_typing" | "quick_trivia" | null> {
  try {
    const view = (await app.deps.speedTyping.getSessionView(sessionId)) as { activityKey?: string };
    if (view?.activityKey === "speed_typing") {
      return "speed_typing";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.startsWith("session_not_found") && !message.startsWith("session_state_missing")) {
      throw error;
    }
  }

  try {
    const view = (await app.deps.quickTrivia.getSessionView(sessionId)) as { activityKey?: string };
    if (view?.activityKey === "quick_trivia") {
      return "quick_trivia";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.startsWith("session_not_found") && !message.startsWith("session_state_missing")) {
      throw error;
    }
  }

  return null;
}

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/activities/session",
    {
      config: {
        rateLimit: { limit: 20, windowMs: 60_000 },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth?.userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const activityKey = (request.body as any)?.activityKey;
      const useQuickTrivia = activityKey === "quick_trivia";
      const parseResult = (useQuickTrivia ? createQuickTriviaSessionDto : createSessionDto).safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: "invalid_request", details: parseResult.error.flatten() });
      }

      const dto = parseResult.data;
      if (!request.auth.isAdmin && dto.creatorUserId !== request.auth.userId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      try {
        const sessionId = useQuickTrivia
          ? await app.deps.quickTrivia.createSession({
              ...(dto as any),
              creatorUserId: request.auth.userId,
            })
          : await app.deps.speedTyping.createSession({
              ...(dto as any),
              creatorUserId: request.auth.userId,
            });
        return reply.status(201).send({ sessionId });
      } catch (error) {
        return respondWithError(reply, error);
      }
    },
  );

  app.post(
    "/activities/session/:id/start",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!request.auth?.userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      try {
        const owner = await resolveSessionOwner(app, request.params.id);
        if (owner === "quick_trivia") {
          await app.deps.quickTrivia.startSession({
            sessionId: request.params.id,
            byUserId: request.auth.userId,
            isAdmin: request.auth.isAdmin,
          });
        } else if (owner === "speed_typing") {
          await app.deps.speedTyping.startSession({
            sessionId: request.params.id,
            byUserId: request.auth.userId,
            isAdmin: request.auth.isAdmin,
          });
        } else {
          return reply.status(404).send({ error: "session_not_found" });
        }
        return reply.status(202).send({ ok: true });
      } catch (error) {
        return respondWithError(reply, error);
      }
    },
  );

  app.post("/activities/session/:id/join", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.auth?.userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const parseResult = joinSessionDto.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "invalid_request", details: parseResult.error.flatten() });
    }

    const dto = parseResult.data;
    if (!request.auth.isAdmin && request.auth.userId !== dto.userId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const participant = await app.deps.prisma.participant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: request.params.id,
          userId: dto.userId,
        },
      },
    });

    if (!participant) {
      return reply.status(404).send({ error: "participant_not_found" });
    }

    try {
      const owner = await resolveSessionOwner(app, request.params.id);
      if (!owner) {
        return reply.status(404).send({ error: "session_not_found" });
      }
      if (owner === "quick_trivia") {
        await app.deps.quickTrivia.joinSession({ sessionId: request.params.id, userId: dto.userId });
      } else {
        await app.deps.speedTyping.joinSession({ sessionId: request.params.id, userId: dto.userId });
      }
    } catch (error) {
      return respondWithError(reply, error);
    }

    await grantSessionPermit(app.deps.redis, request.params.id, dto.userId);

    return reply.status(202).send({ ok: true, permitTtlSeconds: permitTtlSeconds() });
  });

  app.post("/activities/session/:id/leave", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.auth?.userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const parseResult = leaveSessionDto.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "invalid_request", details: parseResult.error.flatten() });
    }

    const dto = parseResult.data;
    if (!request.auth.isAdmin && request.auth.userId !== dto.userId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    try {
      const owner = await resolveSessionOwner(app, request.params.id);
      if (!owner) {
        return reply.status(404).send({ error: "session_not_found" });
      }
      if (owner === "quick_trivia") {
        await app.deps.quickTrivia.leaveSession({ sessionId: request.params.id, userId: dto.userId });
      } else {
        await app.deps.speedTyping.leaveSession({ sessionId: request.params.id, userId: dto.userId });
      }
    } catch (error) {
      return respondWithError(reply, error);
    }

    return reply.status(202).send({ ok: true });
  });

  app.post("/activities/session/:id/ready", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.auth?.userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const parseResult = readyStateDto.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "invalid_request", details: parseResult.error.flatten() });
    }

    const dto = parseResult.data;
    if (!request.auth.isAdmin && request.auth.userId !== dto.userId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    try {
      const owner = await resolveSessionOwner(app, request.params.id);
      if (!owner) {
        return reply.status(404).send({ error: "session_not_found" });
      }
      if (owner === "quick_trivia") {
        await app.deps.quickTrivia.setReady({ sessionId: request.params.id, userId: dto.userId, ready: dto.ready ?? true });
      } else {
        await app.deps.speedTyping.setReady({ sessionId: request.params.id, userId: dto.userId, ready: dto.ready ?? true });
      }
    } catch (error) {
      return respondWithError(reply, error);
    }

    return reply.status(202).send({ ok: true });
  });

  app.get(
    "/activities/session/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        try {
          const view = await app.deps.speedTyping.getSessionView(request.params.id);
          return reply.status(200).send(view);
        } catch {
          const viewQT = await app.deps.quickTrivia.getSessionView(request.params.id);
          return reply.status(200).send(viewQT);
        }
      } catch (error) {
        return respondWithError(reply, error);
      }
    },
  );
}
