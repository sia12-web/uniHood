// Removed SocketStream strict typing; Fastify's websocket types differ across versions.
// Use a lightweight structural type to avoid build errors.
interface FastifySocketStream { socket: any }

export interface OutboundMessage {
  type: string;
  payload?: unknown;
}

interface SessionSocket {
  stream: FastifySocketStream;
  pending: number;
  heartbeat: ReturnType<typeof setInterval>;
}

export class SessionSocketHub {
  private readonly sessions = new Map<string, Set<SessionSocket>>();

  add(sessionId: string, stream: FastifySocketStream): SessionSocket {
    const socket: SessionSocket = {
      stream,
      pending: 0,
      heartbeat: setInterval(() => {
        if (stream.socket.readyState === stream.socket.OPEN) {
          try {
            stream.socket.ping();
          } catch (error) {
            stream.socket.close(1011, "ping_failed");
          }
        }
      }, 20_000),
    };

    const group = this.sessions.get(sessionId);
    if (group) {
      group.add(socket);
    } else {
      this.sessions.set(sessionId, new Set([socket]));
    }

    stream.socket.on("close", () => {
      this.remove(sessionId, socket);
    });

    stream.socket.on("error", () => {
      this.remove(sessionId, socket);
    });

    return socket;
  }

  remove(sessionId: string, socket: SessionSocket): void {
    const group = this.sessions.get(sessionId);
    if (!group) {
      return;
    }
    group.delete(socket);
    clearInterval(socket.heartbeat);
    if (group.size === 0) {
      this.sessions.delete(sessionId);
    }
  }

  async publish(sessionId: string, message: OutboundMessage): Promise<void> {
    const group = this.sessions.get(sessionId);
    if (!group) {
      return;
    }

    const payload = JSON.stringify(message);

    for (const socket of group) {
      if (socket.pending > 50) {
        socket.stream.socket.close(1013, "backpressure");
        this.remove(sessionId, socket);
        continue;
      }

      socket.pending += 1;
      socket.stream.socket.send(payload, (error?: Error) => {
        socket.pending = Math.max(0, socket.pending - 1);
        if (error) {
          this.remove(sessionId, socket);
        }
      });
    }
  }
}
