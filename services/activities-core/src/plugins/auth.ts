import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";

export interface AuthenticatedRequest {
  userId: string;
  isAdmin: boolean;
  isCreator: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthenticatedRequest;
  }
}

function parseBearer(header: string | undefined): AuthenticatedRequest | null {
  if (!header) {
    return null;
  }
  const [scheme, rawToken] = header.split(" ", 2);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !rawToken) {
    return null;
  }

  const token = rawToken.trim();
  const secret = process.env.API_BEARER_TOKEN?.trim();

  let descriptor = token;
  if (secret) {
    const [providedSecret, rest] = token.split(":", 2);
    if (!rest || providedSecret !== secret) {
      return null;
    }
    descriptor = rest;
  }

  const parts = descriptor.split(":").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }

  const [userId, ...flags] = parts;
  const normalizedFlags = new Set(flags.map((value) => value.toLowerCase()));

  return {
    userId,
    isAdmin: normalizedFlags.has("admin"),
    isCreator: normalizedFlags.has("creator"),
  };
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  fastify.addHook("preHandler", async (request: FastifyRequest) => {
    const auth = parseBearer(request.headers.authorization);
    if (auth) {
      request.auth = auth;
    }
  });
};

export async function registerAuthPlugin(app: FastifyInstance) {
  await app.register(authPlugin);
}
