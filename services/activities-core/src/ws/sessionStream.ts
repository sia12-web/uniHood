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

export async function registerSessionStream(app: FastifyInstance): Promise<void> {
  app.get(
    "/activities/session/:id/stream",
    { websocket: true },
  (connection: any, request: FastifyRequest<{ Params: { id: string } }>) => {
  const socket = connection.socket;
  const sessionId = request.params.id;
  const userId = request.auth?.userId;
  let ready = false;
  let activityKeyCache: string | undefined;

      if (!userId) {
        socket.close(4401, "unauthorized");
        return;
      }

      void (async () => {
        const permitted = await consumeSessionPermit(app.deps.redis, sessionId, userId);
        if (!permitted) {
          socket.close(4403, "not_joined");
          return;
        }

        app.sessionHub.add(sessionId, connection);

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
        } catch (error) {
          request.log.error({ err: error }, "failed to fetch session snapshot");
          socket.close(1011, "internal_error");
        }
      })().catch((error) => {
        request.log.error({ err: error }, "session stream init failed");
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
