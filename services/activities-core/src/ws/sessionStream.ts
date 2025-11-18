import { FastifyInstance, FastifyRequest } from "fastify";
import {
  submitRoundDto,
  submitQuickTriviaRoundDto,
  keystrokeSampleDto,
  pingDto,
} from "../dto/sessionDtos";
import { consumeSessionPermit } from "./permits";
import { RateLimitExceededError } from "../lib/rateLimiter";

interface StreamMessage {
  type: string;
  payload?: unknown;
}

type WebSocketLike = {
  close: (code?: number, reason?: string) => void;
  send: (payload: string, cb?: (error?: Error) => void) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  ping?: () => void;
  readyState?: number;
  OPEN?: number;
};

type SocketStreamLike = {
  socket: WebSocketLike;
};

function toSocketStream(connection: unknown): SocketStreamLike | null {
  if (connection && typeof connection === "object") {
    const candidate = connection as Record<string, unknown> & { socket?: WebSocketLike };
    if (candidate.socket && typeof candidate.socket.send === "function") {
      return candidate as SocketStreamLike;
    }
    if (typeof (candidate as WebSocketLike).send === "function" && typeof (candidate as WebSocketLike).on === "function") {
      return { socket: candidate as unknown as WebSocketLike };
    }
  }
  return null;
}

export async function registerSessionStream(app: FastifyInstance): Promise<void> {
  app.get(
    "/activities/session/:id/stream",
    { websocket: true },
    (rawConnection: unknown, request: FastifyRequest<{ Params: { id: string } }>) => {
      const stream = toSocketStream(rawConnection);
      if (!stream) {
        if (rawConnection && typeof (rawConnection as { close?: (code?: number, reason?: string) => void }).close === "function") {
          (rawConnection as { close: (code?: number, reason?: string) => void }).close(1011, "internal_error");
        }
        request.log.error({ connection: rawConnection }, "WebSocket connection missing socket reference");
        return;
      }

      const socket = stream.socket;
      const sessionId = request.params.id;
      let userId = request.auth?.userId;
      let ready = false;
      let activityKeyCache: string | undefined;

      try {
        (request as any).log?.info?.({ path: request.url, rawUrl: (request as any).raw?.url, auth: request.auth }, "stream: auth state at handler entry");
      } catch {}

      // Dev-only last resort: infer userId from raw URL query (authToken/userId) if missing
      if (!userId) {
        const allowInsecure = (process.env.ALLOW_INSECURE_BEARER ?? "").toLowerCase() === "1" ||
          (process.env.NODE_ENV ?? "").toLowerCase() === "development";
        if (allowInsecure) {
          try {
            const rawUrl: string | undefined = (request as any).raw?.url;
            if (rawUrl && rawUrl.includes("?")) {
              const qs = rawUrl.slice(rawUrl.indexOf("?") + 1);
              const params = new URLSearchParams(qs);
              const qUserId = params.get("userId") || "";
              const authToken = params.get("authToken") || "";
              const decodeBase64Url = (input: string) => {
                try {
                  let s = input.replace(/-/g, "+").replace(/_/g, "/");
                  const pad = s.length % 4;
                  if (pad === 2) s += "==";
                  else if (pad === 3) s += "=";
                  else if (pad !== 0) s += "==";
                  return Buffer.from(s, "base64").toString("utf8");
                } catch { return ""; }
              };
              if (authToken) {
                const parts = authToken.split(".");
                if (parts.length >= 2) {
                  try {
                    const payloadJson = decodeBase64Url(parts[1]);
                    const payload = JSON.parse(payloadJson);
                    const sub = typeof payload?.sub === "string" ? payload.sub.trim() : "";
                    if (sub) {
                      userId = sub;
                      try { (request as any).log?.warn?.({ path: request.url }, "stream: inferred userId from rawurl.authToken.sub"); } catch {}
                    }
                  } catch {}
                }
              }
              if (!userId && qUserId) {
                userId = qUserId.trim();
                try { (request as any).log?.warn?.({ path: request.url }, "stream: inferred userId from rawurl.userId"); } catch {}
              }
            }
          } catch {}
        }
      }

      if (!userId) {
        try {
          socket.send(JSON.stringify({ type: "error", payload: { code: "unauthorized" } }));
        } catch {}
        socket.close(4401, "unauthorized");
        try { (request as any).log?.warn?.({ path: request.url }, "stream: unauthorized (no userId)"); } catch {}
        return;
      }

      void (async () => {
        const permitted = await consumeSessionPermit(app.deps.redis, sessionId, userId);
        if (!permitted) {
          try {
            socket.send(JSON.stringify({ type: "error", payload: { code: "not_joined" } }));
          } catch {}
          socket.close(4403, "not_joined");
          try { (request as any).log?.warn?.({ path: request.url, sessionId, userId }, "stream: no permit (not_joined)"); } catch {}
          return;
        }
        try { (request as any).log?.info?.({ path: request.url, sessionId, userId }, "stream: permit consumed"); } catch {}

        app.sessionHub.add(sessionId, stream);

        // Observe socket lifecycle for diagnostics
        try {
          socket.on("close", (code: number, reason: Buffer) => {
            const text = (() => {
              try { return (reason as any)?.toString?.("utf8") || ""; } catch { return ""; }
            })();
            try { (request as any).log?.warn?.({ path: request.url, sessionId, userId, code, reason: text }, "stream: socket closed"); } catch {}
          });
        } catch {}
        try {
          socket.on("error", (err: unknown) => {
            try { (request as any).log?.error?.({ path: request.url, sessionId, userId, err }, "stream: socket error"); } catch {}
          });
        } catch {}

        try {
          let view: unknown;
          try {
            view = await app.deps.speedTyping.getSessionView(sessionId);
            activityKeyCache = "speed_typing";
          } catch {
            view = await app.deps.quickTrivia.getSessionView(sessionId);
            activityKeyCache = "quick_trivia";
          }
          ready = true;
          socket.send(JSON.stringify({ type: "session.snapshot", payload: view }));
          try { (request as any).log?.info?.({ path: request.url, sessionId, userId }, "stream: snapshot sent"); } catch {}
        } catch (error) {
          try { (request as any).log?.error?.({ err: error, path: request.url, sessionId, userId }, "failed to fetch session snapshot"); } catch {}
          try {
            socket.send(JSON.stringify({ type: "error", payload: { code: "internal_error" } }));
          } catch {}
          socket.close(1011, "internal_error");
        }
      })().catch((error) => {
        try { (request as any).log?.error?.({ err: error, path: request.url, sessionId, userId }, "session stream init failed"); } catch {}
        try {
          socket.send(JSON.stringify({ type: "error", payload: { code: "internal_error" } }));
        } catch {}
        socket.close(1011, "internal_error");
      });

    socket.on("message", (raw: unknown) => {
        try {
          const message: StreamMessage = JSON.parse(String(raw));
          if (!ready) {
            socket.send(JSON.stringify({ type: "error", payload: { code: "not_ready" } }));
            return;
          }
          if (message.type === "submit") {
            void (async () => {
              // Determine session activity to choose correct DTO
              // We fetch session view cheaply via speedTyping (may throw) then quickTrivia; prefer existing state
              let useQuickTrivia = activityKeyCache === "quick_trivia";
              if (activityKeyCache === undefined) {
                let activityKey: string | undefined;
                try {
                  const snapshot = (await app.deps.speedTyping.getSessionView(sessionId)) as { activityKey?: string };
                  activityKey = snapshot.activityKey;
                } catch {
                  try {
                    const snapshotQT = (await app.deps.quickTrivia.getSessionView(sessionId)) as { activityKey?: string };
                    activityKey = snapshotQT.activityKey;
                  } catch {
                    activityKey = undefined;
                  }
                }
                activityKeyCache = activityKey;
                useQuickTrivia = activityKey === "quick_trivia";
              }
              const parseResult = (useQuickTrivia ? submitQuickTriviaRoundDto : submitRoundDto).safeParse(message.payload);
              if (!parseResult.success) {
                socket.send(
                  JSON.stringify({
                    type: "error",
                    payload: { code: "invalid_payload", details: parseResult.error.flatten() },
                  }),
                );
                return;
              }

              const submission = parseResult.data;
              if (submission.userId !== userId) {
                socket.send(
                  JSON.stringify({ type: "error", payload: { code: "forbidden", details: "user_id_mismatch" } }),
                );
                return;
              }
              if (useQuickTrivia) {
                app.deps.quickTrivia
                  .submitRound({
                    sessionId,
                    userId,
                    choiceIndex: (submission as any).choiceIndex,
                    clientMs: (submission as any).clientMs,
                  })
                  .then(() => {
                    socket.send(JSON.stringify({ type: "ack", payload: { submission: "accepted" } }));
                  })
                  .catch((error: unknown) => {
                    if (error instanceof RateLimitExceededError) {
                      socket.send(JSON.stringify({ type: "error", payload: { code: "rate_limit_exceeded" } }));
                      return;
                    }
                    const messageText = error instanceof Error ? error.message : "submission_failed";
                    socket.send(JSON.stringify({ type: "error", payload: { code: messageText } }));
                  });
              } else {
                app.deps.speedTyping
                  .submitRound({
                    sessionId,
                    userId,
                    typedText: (submission as any).typedText,
                    clientMs: (submission as any).clientMs,
                  })
                  .then(() => {
                    socket.send(JSON.stringify({ type: "ack", payload: { submission: "accepted" } }));
                  })
                  .catch((error: unknown) => {
                    if (error instanceof RateLimitExceededError) {
                      socket.send(JSON.stringify({ type: "error", payload: { code: "rate_limit_exceeded" } }));
                      return;
                    }
                    const messageText = error instanceof Error ? error.message : "submission_failed";
                    socket.send(JSON.stringify({ type: "error", payload: { code: messageText } }));
                  });
              }
            })();
          } else if (message.type === "keystroke") {
            const parseResult = keystrokeSampleDto.safeParse(message.payload);
            if (!parseResult.success) {
              socket.send(
                JSON.stringify({ type: "error", payload: { code: "invalid_payload", details: parseResult.error.flatten() } }),
              );
              return;
            }

            const sample = parseResult.data;
            if (sample.userId !== userId) {
              socket.send(JSON.stringify({ type: "error", payload: { code: "forbidden", details: "user_id_mismatch" } }));
              return;
            }

            app.deps.speedTyping
              .recordKeystroke({
                sessionId,
                userId,
                tClientMs: sample.tClientMs,
                len: sample.len,
                isPaste: sample.isPaste,
              })
              .catch((error: unknown) => {
                request.log.error({ err: error }, "keystroke handling failed");
              });
          } else if (message.type === "ping") {
            const parseResult = pingDto.safeParse(message.payload);
            if (!parseResult.success) {
              socket.send(
                JSON.stringify({ type: "error", payload: { code: "invalid_payload", details: parseResult.error.flatten() } }),
              );
              return;
            }

            const { tClientMs } = parseResult.data;
            const serverNow = Date.now();
            const skewPromise = app.deps.speedTyping.updateSkewEstimate({
              sessionId,
              userId,
              tClientMs,
              serverNow,
            });
            void skewPromise
              .then((skewEstimate) => {
                socket.send(
                  JSON.stringify({
                    type: "pong",
                    payload: {
                      tServerMs: serverNow,
                      skewEstimateMs: skewEstimate,
                    },
                  }),
                );
              })
              .catch((error: unknown) => {
                request.log.error({ err: error }, "skew update failed");
              });
          }
        } catch (error) {
          socket.send(
            JSON.stringify({ type: "error", payload: { code: "bad_format", details: (error as Error).message } }),
          );
        }
      });
    },
  );
}
