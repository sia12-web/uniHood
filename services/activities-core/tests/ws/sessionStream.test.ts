import { EventEmitter } from "events";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSessionStream } from "../../src/ws/sessionStream";
import type { SessionView } from "../../src/dto/sessionDtos";
import type { SpeedTypingService } from "../../src/services/speedTyping";
import { consumeSessionPermit } from "../../src/ws/permits";

vi.mock("../../src/ws/permits", () => ({
  consumeSessionPermit: vi.fn(),
}));

class SocketMock extends EventEmitter {
  public readonly OPEN = 1;
  public readyState = 1;
  public sent: string[] = [];

  send(payload: string, cb?: (error?: Error) => void): void {
    this.sent.push(String(payload));
    cb?.();
  }

  close = vi.fn();
  ping = vi.fn();
}

const defaultSessionView: SessionView = {
  id: "sess-1",
  status: "running",
  activityKey: "speed_typing",
  participants: [],
  rounds: [],
};

const permitMock = vi.mocked(consumeSessionPermit);

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type SpeedTypingMocks = {
  createSession: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  submitRound: ReturnType<typeof vi.fn>;
  getSessionView: ReturnType<typeof vi.fn>;
  handleTimerElapsed: ReturnType<typeof vi.fn>;
  recordKeystroke: ReturnType<typeof vi.fn>;
  updateSkewEstimate: ReturnType<typeof vi.fn>;
};

async function createStream(overrides?: Partial<SpeedTypingMocks>) {
  const socket = new SocketMock();
  const connection = { socket } as { socket: typeof socket };

  const speedTypingMocks: SpeedTypingMocks = {
    createSession: vi.fn(),
    startSession: vi.fn(),
    submitRound: vi.fn(),
    getSessionView: vi.fn().mockResolvedValue(defaultSessionView),
    handleTimerElapsed: vi.fn(),
    recordKeystroke: vi.fn().mockResolvedValue([]),
    updateSkewEstimate: vi.fn().mockResolvedValue(0),
  };

  Object.assign(speedTypingMocks, overrides);

  let routeHandler:
    | ((connection: { socket: typeof socket }, request: FastifyRequest<{ Params: { id: string } }>) => void)
    | undefined;

  const app = {
    get: vi.fn((path: string, _opts: unknown, handler: typeof routeHandler) => {
      routeHandler = handler;
    }),
    deps: { speedTyping: speedTypingMocks as unknown as SpeedTypingService },
    sessionHub: {
      add: vi.fn(),
      remove: vi.fn(),
      publish: vi.fn(),
    },
  } as unknown as FastifyInstance & {
    deps: { speedTyping: SpeedTypingService };
    sessionHub: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn> };
  };

  await registerSessionStream(app);

  if (!routeHandler) {
    throw new Error("route handler not registered");
  }

  const request = {
    params: { id: "sess-1" },
    auth: { userId: "user-1" },
    log: { error: vi.fn() },
  } as unknown as FastifyRequest<{ Params: { id: string } }>;

  routeHandler(connection, request);
  await flushMicrotasks();

  return {
    socket,
    request,
    speedTyping: speedTypingMocks,
  };
}

describe("session stream websocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permitMock.mockResolvedValue(true);
  });

  it("forwards keystroke samples to the speed typing service", async () => {
    const { socket, speedTyping } = await createStream();

    socket.emit(
      "message",
      JSON.stringify({
        type: "keystroke",
        payload: { userId: "user-1", tClientMs: 1_234, len: 42, isPaste: true },
      }),
    );

    await flushMicrotasks();

    expect(speedTyping.recordKeystroke).toHaveBeenCalledWith({
      sessionId: "sess-1",
      userId: "user-1",
      tClientMs: 1_234,
      len: 42,
      isPaste: true,
    });
    expect(socket.sent).toHaveLength(1);
    const snapshot = JSON.parse(socket.sent[0]!);
    expect(snapshot.type).toBe("session.snapshot");
  });

  it("responds with skew-aware pong messages", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123_000);
    const skewEstimate = 37;
    const { socket, speedTyping } = await createStream({
      updateSkewEstimate: vi.fn().mockResolvedValue(skewEstimate),
    });

    socket.emit("message", JSON.stringify({ type: "ping", payload: { userId: "user-1", tClientMs: 555 } }));

    await flushMicrotasks();

    expect(speedTyping.updateSkewEstimate).toHaveBeenCalledWith({
      sessionId: "sess-1",
      userId: "user-1",
      tClientMs: 555,
      serverNow: 123_000,
    });

    const lastMessage = JSON.parse(socket.sent.at(-1)!);
    expect(lastMessage.type).toBe("pong");
    expect(lastMessage.payload).toMatchObject({
      tServerMs: 123_000,
      skewEstimateMs: skewEstimate,
    });

    nowSpy.mockRestore();
  });
});
