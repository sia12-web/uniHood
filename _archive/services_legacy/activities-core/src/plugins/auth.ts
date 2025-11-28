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
  // Normalize secret and strip accidental surrounding quotes from env files
  const secret = (process.env.API_BEARER_TOKEN ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
    (process.env.NODE_ENV ?? "").toLowerCase() === "development";

  let descriptor = token;
  if (secret) {
    const [providedSecret, rest] = token.split(":", 2);
    if (!rest || providedSecret !== secret) {
      return null;
    }
    descriptor = rest;
  } else if (!allowInsecure) {
    // Secret is required in non-development unless ALLOW_INSECURE_BEARER=1 is explicitly set
    return null;
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

// Base64URL decode helper (tolerates missing padding)
function decodeBase64Url(input: string): string {
  try {
    let s = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4;
    if (pad === 2) s += "==";
    else if (pad === 3) s += "=";
    else if (pad !== 0) s += "=="; // fallback
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function tryInferUserFromJwt(token: string): string {
  const parts = token.split(".");
  if (parts.length < 2) return "";
  try {
    const payloadJson = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadJson);
    const sub = typeof payload?.sub === "string" ? payload.sub.trim() : "";
    return sub;
  } catch {
    return "";
  }
}

function parseRawUrlParams(url: string | undefined): { authToken?: string; userId?: string } {
  if (!url) return {};
  const qIndex = url.indexOf("?");
  if (qIndex < 0) return {};
  const qs = url.slice(qIndex + 1);
  try {
    const params = new URLSearchParams(qs);
    const authToken = params.get("authToken") || undefined;
    const userId = params.get("userId") || undefined;
    return { authToken: authToken?.trim() || undefined, userId: userId?.trim() || undefined };
  } catch {
    return {};
  }
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  // Stage 1: onRequest — check Authorization bearer and X-User-Id (headers only)
  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    try {
      const headerKeys = Object.keys(request.headers || {});
      const hasAuth = typeof request.headers.authorization === "string" && request.headers.authorization.trim().length > 0;
      const hasXUser = typeof request.headers["x-user-id"] === "string" && String(request.headers["x-user-id"]).trim().length > 0;
      fastify.log.info({ path: request.url, headers: headerKeys, hasAuth, hasXUser }, "request headers (keys only)");
    } catch {}

    const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
      (process.env.NODE_ENV ?? "").toLowerCase() === "development";

    const authHeader = request.headers.authorization;
    const parsed = parseBearer(authHeader);
    if (parsed) {
      request.auth = parsed;
      fastify.log.info({ path: request.url }, "auth ok via bearer");
      return;
    }

    if (allowInsecure) {
      // Dev-only helpers: infer auth from query early for websocket upgrades
      try {
        const q: any = (request as any).query;
        const qUserId = q && typeof q.userId === "string" ? q.userId.trim() : "";
        const authToken = q && typeof q.authToken === "string" ? q.authToken.trim() : "";
        if (!request.auth?.userId && authToken) {
          const sub = tryInferUserFromJwt(authToken);
          if (sub) {
            request.auth = { userId: sub, isAdmin: false, isCreator: false };
            fastify.log.warn({ path: request.url, source: "query.authToken.sub" }, "Auth fallback: using insecure/dev mode");
            return;
          }
        }
        if (!request.auth?.userId && qUserId) {
          request.auth = { userId: qUserId, isAdmin: false, isCreator: false } as any;
          fastify.log.warn({ path: request.url, source: "query.userId" }, "Auth fallback: using insecure/dev mode");
          return;
        }
      } catch {}

      // If query isn't available yet (e.g., websocket upgrade), parse from raw URL
      if (!request.auth?.userId) {
        const { authToken: rawAuthToken, userId: rawUserId } = parseRawUrlParams((request as any).raw?.url);
        fastify.log.info({ path: request.url, rawUrl: (request as any).raw?.url, rawAuthToken: !!rawAuthToken, rawUserId: rawUserId }, "auth raw-url parse attempt (onRequest)");
        if (rawAuthToken) {
          const sub = tryInferUserFromJwt(rawAuthToken);
          if (sub) {
            request.auth = { userId: sub, isAdmin: false, isCreator: false };
            fastify.log.warn({ path: request.url, source: "rawurl.authToken.sub" }, "Auth fallback: using insecure/dev mode");
          }
        }
        if (!request.auth?.userId && rawUserId) {
          request.auth = { userId: rawUserId, isAdmin: false, isCreator: false };
          fastify.log.warn({ path: request.url, source: "rawurl.userId" }, "Auth fallback: using insecure/dev mode");
        }
        if (!request.auth?.userId) {
          fastify.log.info({ path: request.url }, "auth raw-url parse did not yield userId");
        }
        if (request.auth?.userId) return;
      }

      // Header-based insecure fallback last
      const xUserIdRaw = request.headers["x-user-id"];
      const xUserId = Array.isArray(xUserIdRaw) ? xUserIdRaw[0] : xUserIdRaw;
      const fromHeader = (typeof xUserId === "string" && xUserId.trim().length > 0) ? xUserId.trim() : "";
      if (fromHeader) {
        request.auth = { userId: fromHeader, isAdmin: false, isCreator: false };
        fastify.log.warn({ path: request.url, source: "x-user-id" }, "Auth fallback: using insecure/dev mode");
        return;
      }
    }
  });

  // Stage 2: preValidation — if still unauthenticated, use body.userId (requires parsed body)
  fastify.addHook("preValidation", async (request: FastifyRequest) => {
    if (request.auth?.userId) {
      return;
    }
    const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
      (process.env.NODE_ENV ?? "").toLowerCase() === "development";
    if (!allowInsecure) {
      return;
    }

    // Dev-only helpers: try to infer auth from query (supports websocket authToken or userId)
    try {
      const q: any = (request as any).query;
      const qUserId = q && typeof q.userId === "string" ? q.userId.trim() : "";
      const authToken = q && typeof q.authToken === "string" ? q.authToken.trim() : "";
      if (!request.auth?.userId && authToken) {
        // Try to decode a JWT-like token and read the payload.sub as userId (no signature verification in dev)
        const sub = tryInferUserFromJwt(authToken);
        if (sub) {
          request.auth = { userId: sub, isAdmin: false, isCreator: false };
          fastify.log.warn({ path: request.url, source: "query.authToken.sub" }, "Auth fallback: using insecure/dev mode");
          return;
        }
      }
      if (!request.auth?.userId && qUserId) {
        request.auth = { userId: qUserId, isAdmin: false, isCreator: false } as any;
        fastify.log.warn({ path: request.url, source: "query.userId" }, "Auth fallback: using insecure/dev mode");
        return;
      }
    } catch {}
    // For completeness in non-HTTP bodies processed during upgrades, parse raw URL here too
    if (!request.auth?.userId) {
      const { authToken: rawAuthToken, userId: rawUserId } = parseRawUrlParams((request as any).raw?.url);
      fastify.log.info({ path: request.url, rawUrl: (request as any).raw?.url, rawAuthToken: !!rawAuthToken, rawUserId: rawUserId }, "auth raw-url parse attempt (preValidation)");
      if (rawAuthToken) {
        const sub = tryInferUserFromJwt(rawAuthToken);
        if (sub) {
          request.auth = { userId: sub, isAdmin: false, isCreator: false };
          fastify.log.warn({ path: request.url, source: "rawurl.authToken.sub" }, "Auth fallback: using insecure/dev mode");
          return;
        }
      }
      if (!request.auth?.userId && rawUserId) {
        request.auth = { userId: rawUserId, isAdmin: false, isCreator: false };
        fastify.log.warn({ path: request.url, source: "rawurl.userId" }, "Auth fallback: using insecure/dev mode");
        return;
      }
      if (!request.auth?.userId) {
        fastify.log.info({ path: request.url }, "auth raw-url parse did not yield userId (preValidation)");
      }
    }

    const bodyUserId = (request.body && typeof request.body === "object" && (request.body as any).userId)
      ? String((request.body as any).userId)
      : "";
    const fromBody = bodyUserId.trim();
    if (fromBody) {
      request.auth = { userId: fromBody, isAdmin: false, isCreator: false };
      fastify.log.warn({ path: request.url, source: "body.userId" }, "Auth fallback: using insecure/dev mode");
    } else {
      const hasAuthHeader = Boolean(request.headers.authorization && request.headers.authorization.trim().length > 0);
      fastify.log.info({ path: request.url, hasAuthHeader, allowInsecure }, "authentication missing");
    }
  });
  if (!process.env.API_BEARER_TOKEN?.trim()) {
    const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
      (process.env.NODE_ENV ?? "").toLowerCase() === "development";
    if (!allowInsecure) {
      fastify.log.warn("API_BEARER_TOKEN is not set. Authentication will be rejected in this mode.");
    } else {
      fastify.log.warn("API_BEARER_TOKEN is not set. Allowing insecure bearer format in development.");
    }
  }
};

export async function registerAuthPlugin(app: FastifyInstance) {
  const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
    (process.env.NODE_ENV ?? "").toLowerCase() === "development";
  if (allowInsecure) {
    app.log.warn("Auth: insecure dev fallback is ENABLED (X-User-Id/body.userId allowed)");
  } else {
    app.log.info("Auth: insecure dev fallback is disabled; API_BEARER_TOKEN required");
  }
  await app.register(authPlugin);
}
