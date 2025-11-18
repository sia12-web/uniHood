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
  | "session_full"
  | "round_not_started"
  | "round_not_found"
  | "forbidden"
  | "rate_limit_error"
  | "rate_limit_exceeded"
  | "participant_not_in_session"
  | "invalid_request"
  | "session_state_missing"
  | "unauthorized"
  | "internal_error"
  | "session_not_running";

function respondWithError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof RateLimitExceededError) {
    return reply.status(429).send({ error: "rate_limit_exceeded" satisfies KnownErrorCode });
  }

  let message: string | null = null;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof (error as any).code === "string") {
    message = (error as any).code;
  } else if (error && typeof (error as any).message === "string") {
    message = (error as any).message;
  }

  if (message) {
    const code = message as KnownErrorCode | string;
    switch (true) {
      case code.startsWith("session_state_missing"):
        return reply.status(410).send({ error: "session_state_missing" satisfies KnownErrorCode });
      case code === "unsupported_activity":
      case code === "invalid_participants":
      case code === "round_not_started":
      case code === "round_not_found":
      case code === "invalid_request":
        return reply.status(400).send({ error: code as KnownErrorCode });
      case code === "unauthorized":
        return reply.status(401).send({ error: code as KnownErrorCode });
      case code === "forbidden":
      case code === "participant_not_in_session":
        return reply.status(403).send({ error: code as KnownErrorCode });
      case code === "session_not_found":
        return reply.status(404).send({ error: code as KnownErrorCode });
      case code === "session_not_in_lobby":
      case code === "session_full":
      case code === "session_not_running":
        return reply.status(409).send({ error: code as KnownErrorCode });
      case code === "rate_limit_error":
      case code === "rate_limit_exceeded":
        return reply.status(429).send({ error: code as KnownErrorCode });
      default:
        reply.log.error({ err: error, message: code }, "unhandled error in session route");
        return reply.status(500).send({ error: "internal_error" satisfies KnownErrorCode, details: code });
    }
  }

  reply.log.error({ err: error }, "non-standard error value thrown");
  return reply.status(500).send({ error: "internal_error" satisfies KnownErrorCode });
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

type SessionListQuery = {
  status?: "pending" | "running" | "ended" | "all";
  userId?: string;
};

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/activities/sessions",
    async (request: FastifyRequest<{ Querystring: SessionListQuery }>, reply: FastifyReply) => {
      let userId = request.auth?.userId;
      if (!userId) {
        const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
          (process.env.NODE_ENV ?? "").toLowerCase() === "development";
        if (allowInsecure) {
          const headerUserId = (() => {
            const raw = request.headers["x-user-id"];
            if (typeof raw === "string" && raw.trim()) {
              return raw.trim();
            }
            if (Array.isArray(raw) && raw[0]) {
              return String(raw[0]).trim();
            }
            return "";
          })();

          const bearerUserId = (() => {
            const raw = request.headers.authorization;
            if (typeof raw !== "string") {
              return "";
            }
            const prefix = "bearer ";
            if (!raw.toLowerCase().startsWith(prefix)) {
              return "";
            }
            const token = raw.slice(prefix.length).trim();
            if (!token) {
              return "";
            }
            const parts = token.split(":");
            return parts[parts.length - 1]?.trim() ?? "";
          })();

          const queryUserId = typeof request.query?.userId === "string" ? request.query.userId.trim() : "";

          userId = headerUserId || bearerUserId || queryUserId || undefined;
          if (userId) {
            request.auth = { userId, isAdmin: false, isCreator: false } as any;
          }
        }
      }

      if (!userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const statusFilter = request.query?.status ?? "pending";
      const statuses = statusFilter === "all" ? undefined : [statusFilter];

      try {
        const [speedTypingSessions, quickTriviaSessions] = await Promise.all([
          app.deps.speedTyping.listSessionsForUser({
            userId,
            statuses: statuses as Array<"pending" | "running" | "ended"> | undefined,
          }),
          app.deps.quickTrivia.listSessionsForUser({
            userId,
            statuses: statuses as Array<"pending" | "running" | "ended"> | undefined,
          }),
        ]);
        const sessions = [...speedTypingSessions, ...quickTriviaSessions];
        return reply.status(200).send({ sessions });
      } catch (error) {
        return respondWithError(reply, error);
      }
    },
  );

  app.post(
    "/activities/session",
    {
      config: {
        rateLimit: { limit: 20, windowMs: 60_000 },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth?.userId) {
        const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
          (process.env.NODE_ENV ?? "").toLowerCase() === "development";
        if (allowInsecure && request.body && typeof request.body === "object") {
          const body = request.body as Record<string, unknown>;
          const bodyUser = typeof body.userId === "string" && body.userId.trim()
            ? body.userId.trim()
            : (typeof body.creatorUserId === "string" ? body.creatorUserId.trim() : "");
          if (bodyUser) {
            request.auth = { userId: bodyUser, isAdmin: false, isCreator: false } as any;
          }
        }
        if (!request.auth?.userId) {
          return reply.status(401).send({ error: "unauthorized" });
        }
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
        const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
          (process.env.NODE_ENV ?? "").toLowerCase() === "development";
        if (allowInsecure && request.body && typeof request.body === "object") {
          const body = request.body as Record<string, unknown>;
          const bodyUser = typeof body.userId === "string" && body.userId.trim()
            ? body.userId.trim()
            : (typeof body.creatorUserId === "string" ? body.creatorUserId.trim() : "");
          if (bodyUser) {
            request.auth = { userId: bodyUser, isAdmin: false, isCreator: false } as any;
          }
        }
        if (!request.auth?.userId) {
          return reply.status(401).send({ error: "unauthorized" });
        }
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
      const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
        (process.env.NODE_ENV ?? "").toLowerCase() === "development";
      const bodyUserId = (request.body && typeof request.body === "object" && (request.body as any).userId)
        ? String((request.body as any).userId).trim()
        : "";
      if (allowInsecure && bodyUserId) {
        // Dev fallback: infer auth from body.userId to unblock local testing
        request.auth = { userId: bodyUserId, isAdmin: false, isCreator: false } as any;
        request.log.warn({ path: request.url }, "join: dev auth inferred from body.userId");
      } else {
        return reply.status(401).send({ error: "unauthorized" });
      }
    }

    const parseResult = joinSessionDto.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "invalid_request", details: parseResult.error.flatten() });
    }

    const dto = parseResult.data;
    const auth = request.auth as { userId: string; isAdmin: boolean };
    if (!auth.isAdmin && auth.userId !== dto.userId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    let participant = await app.deps.prisma.participant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: request.params.id,
          userId: dto.userId,
        },
      },
    });

    if (!participant) {
      try {
        const owner = await resolveSessionOwner(app, request.params.id);
        if (owner === "speed_typing") {
          await app.deps.speedTyping.addParticipant({ sessionId: request.params.id, userId: dto.userId });
        } else {
          return reply.status(404).send({ error: "participant_not_found" });
        }
      } catch (error) {
        return respondWithError(reply, error);
      }

      participant = await app.deps.prisma.participant.findUnique({
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
      const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
        (process.env.NODE_ENV ?? "").toLowerCase() === "development";
      if (allowInsecure && request.body && typeof request.body === "object") {
        const body = request.body as Record<string, unknown>;
        const bodyUser = typeof body.userId === "string" && body.userId.trim()
          ? body.userId.trim()
          : (typeof body.creatorUserId === "string" ? body.creatorUserId.trim() : "");
        if (bodyUser) {
          request.auth = { userId: bodyUser, isAdmin: false, isCreator: false } as any;
        }
      }
      if (!request.auth?.userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }
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
      const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
        (process.env.NODE_ENV ?? "").toLowerCase() === "development";
      if (allowInsecure && request.body && typeof request.body === "object") {
        const body = request.body as Record<string, unknown>;
        const bodyUser = typeof body.userId === "string" && body.userId.trim()
          ? body.userId.trim()
          : (typeof body.creatorUserId === "string" ? body.creatorUserId.trim() : "");
        if (bodyUser) {
          request.auth = { userId: bodyUser, isAdmin: false, isCreator: false } as any;
        }
      }
      if (!request.auth?.userId) {
        return reply.status(401).send({ error: "unauthorized" });
      }
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
