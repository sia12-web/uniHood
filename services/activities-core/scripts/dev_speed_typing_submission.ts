/// <reference types="node" />
import WebSocket, { RawData } from "ws";

const baseHttp = process.env.ACTIVITIES_BASE_URL ?? "http://127.0.0.1:4005";
const baseWs = baseHttp.replace(/^http/, "ws");
const secret = (process.env.API_BEARER_TOKEN ?? "devtoken").trim();

const participants = ["user-alpha", "user-bravo"] as const;
const creator = participants[0];

function authHeader(userId: string, ...flags: string[]): string {
  const suffix = [userId, ...flags].filter(Boolean).join(":");
  return secret ? `Bearer ${secret}:${suffix}` : `Bearer ${suffix}`;
}

type HttpOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

async function httpJson(path: string, userId: string, options: HttpOptions = {}): Promise<any> {
  const method = options.method ?? "POST";
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(userId),
      ...(options.headers ?? {}),
    },
  };
  if (method !== "GET" && method !== "HEAD") {
    (init as any).body = options.body ?? "{}";
  }
  const response = await fetch(`${baseHttp}${path}`, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${(error as Error).message}\n${text}`);
  }
}

async function createSession(): Promise<string> {
  const payload = {
    activityKey: "speed_typing",
    creatorUserId: creator,
    participants: [...participants],
  };
  const data = await httpJson("/activities/session", creator, { body: JSON.stringify(payload) });
  return data.sessionId as string;
}

async function joinSession(sessionId: string, userId: string): Promise<void> {
  await httpJson(`/activities/session/${sessionId}/join`, userId, {
    body: JSON.stringify({ userId }),
  });
}

async function readyUp(sessionId: string, userId: string): Promise<void> {
  await httpJson(`/activities/session/${sessionId}/ready`, userId, {
    body: JSON.stringify({ userId, ready: true }),
  });
}

async function startSession(sessionId: string): Promise<void> {
  await httpJson(`/activities/session/${sessionId}/start`, creator, {
    body: JSON.stringify({ userId: creator }),
  });
}

async function getSnapshot(sessionId: string, userId: string): Promise<any> {
  return httpJson(`/activities/session/${sessionId}`, userId, { method: "GET", body: undefined });
}

function msUntil(ts: number | string | undefined): number | null {
  if (ts === undefined || ts === null) return null;
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  return t - Date.now();
}

type WsMessage = {
  type: string;
  payload?: any;
};

async function waitForRoundSample(ws: WebSocket): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for round payload"));
    }, 60_000);

    ws.on("message", (raw: RawData) => {
      try {
        const data: WsMessage = JSON.parse(raw.toString());
        // Basic trace to understand live flow
        if (data.type !== "activity.round.started") {
          console.log("WS:", data.type);
        }
        if (data.type === "activity.round.started") {
          const sample = data.payload?.payload?.textSample;
          if (typeof sample === "string" && sample.length > 0) {
            clearTimeout(timeout);
            resolve(sample);
          }
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function pollForSessionEnded(sessionId: string, userId: string, timeoutMs = 180_000): Promise<WsMessage> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const snapshot = await getSnapshot(sessionId, userId);
      if (snapshot?.status === "ended") {
        return { type: "session.snapshot", payload: snapshot };
      }
    } catch (error) {
      console.warn("Snapshot poll failed:", (error as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Timed out waiting for session ended (poll)");
}

async function main() {
  console.log("Creating session...");
  const sessionId = await createSession();
  console.log(`Session ${sessionId}`);

  for (const user of participants) {
    console.log(`Joining ${user}...`);
    await joinSession(sessionId, user);
  }

  console.log("Opening WebSocket for user-alpha...");
  const wsAlpha = new WebSocket(
    `${baseWs}/activities/session/${sessionId}/stream`,
    undefined,
    {
      headers: {
        Authorization: authHeader(participants[0]),
      },
    },
  );

  await new Promise<void>((resolve, reject) => {
    wsAlpha.once("open", () => resolve());
    wsAlpha.once("error", (error) => reject(error));
  });
  console.log("WebSocket connected");

  console.log("Opening WebSocket for user-bravo...");
  const wsBravo = new WebSocket(
    `${baseWs}/activities/session/${sessionId}/stream`,
    undefined,
    {
      headers: {
        Authorization: authHeader(participants[1]),
      },
    },
  );

  await new Promise<void>((resolve, reject) => {
    wsBravo.once("open", () => resolve());
    wsBravo.once("error", (error) => reject(error));
  });
  console.log("Second WebSocket connected");

  console.log("Registering WebSocket handlers and auto-submitters...");
  const submittedRounds = new Set<number>();
  let resolveSessionEnded: ((msg: WsMessage) => void) | null = null;
  const sessionEndedViaWs = new Promise<WsMessage>((resolve) => {
    resolveSessionEnded = resolve;
  });

  const handleSessionEnded = (data: WsMessage) => {
    if (data.type === "activity.session.ended" && resolveSessionEnded) {
      resolveSessionEnded(data);
      resolveSessionEnded = null;
    }
  };

  wsAlpha.on("message", (raw: RawData) => {
    try {
      const data: WsMessage = JSON.parse(raw.toString());
      // Unified verbose trace for alpha socket
      const summary: string[] = [data.type];
      if (data.type === "session.snapshot") {
        const participants = Array.isArray(data.payload?.participants) ? data.payload.participants.length : 0;
        const status = data.payload?.status;
        summary.push(`status=${status}`, `participants=${participants}`);
      } else if (data.type === "activity.session.countdown") {
        summary.push(`reason=${data.payload?.reason}`, `nextRound=${data.payload?.nextRoundIndex}`);
      } else if (data.type === "activity.round.started") {
        summary.push(`roundIndex=${data.payload?.index}`, `sampleLen=${data.payload?.payload?.textSample?.length}`);
      } else if (data.type === "activity.round.ended") {
        summary.push(`roundIndex=${data.payload?.index}`);
      } else if (data.type === "activity.session.started") {
        summary.push(`currentRound=${data.payload?.currentRound}`);
      } else if (data.type === "activity.session.ended") {
        summary.push(`winner=${data.payload?.winnerUserId || data.payload?.finalScoreboard?.winnerUserId}`);
      }
      console.log("WS alpha:", summary.join(" | "));

      if (data.type === "activity.round.started") {
        const idx = data.payload?.index;
        const textSample = data.payload?.payload?.textSample;
        if (typeof idx === "number" && typeof textSample === "string" && !submittedRounds.has(idx)) {
          console.log(`Auto-submitting round ${idx} (${textSample.length} chars)`);
          submittedRounds.add(idx);
          wsAlpha.send(
            JSON.stringify({
              type: "submit",
              payload: {
                userId: participants[0],
                typedText: textSample,
                clientMs: 9_999 + idx,
              },
            }),
          );
          wsBravo.send(
            JSON.stringify({
              type: "submit",
              payload: {
                userId: participants[1],
                typedText: textSample,
                clientMs: 8_888 + idx,
              },
            }),
          );
        }
      }

      if (data.type === "activity.session.ended") {
        handleSessionEnded(data);
      }
    } catch {}
  });

  // Mirror logging for bravo socket (no auto-submit logic needed beyond existing submit sends)
  wsBravo.on("message", (raw: RawData) => {
    try {
      const data: WsMessage = JSON.parse(raw.toString());
      const summary: string[] = [data.type];
      if (data.type === "session.snapshot") {
        const participants = Array.isArray(data.payload?.participants) ? data.payload.participants.length : 0;
        const status = data.payload?.status;
        summary.push(`status=${status}`, `participants=${participants}`);
      } else if (data.type === "activity.session.countdown") {
        summary.push(`reason=${data.payload?.reason}`, `nextRound=${data.payload?.nextRoundIndex}`);
      } else if (data.type === "activity.round.started") {
        summary.push(`roundIndex=${data.payload?.index}`, `sampleLen=${data.payload?.payload?.textSample?.length}`);
      } else if (data.type === "activity.round.ended") {
        summary.push(`roundIndex=${data.payload?.index}`);
      } else if (data.type === "activity.session.started") {
        summary.push(`currentRound=${data.payload?.currentRound}`);
      } else if (data.type === "activity.session.ended") {
        summary.push(`winner=${data.payload?.winnerUserId || data.payload?.finalScoreboard?.winnerUserId}`);
      }
      console.log("WS bravo:", summary.join(" | "));

      if (data.type === "activity.session.ended") {
        handleSessionEnded(data);
      }
    } catch {}
  });

  console.log("Marking participants ready...");
  for (const user of participants) {
    await readyUp(sessionId, user);
  }

  console.log("Starting session...");
  await startSession(sessionId);

  // Poll countdown / round activation if session appears stuck
  console.log("Fetching initial snapshot after start...");
  let snap = await getSnapshot(sessionId, creator);
  console.log("Snapshot(status=%s phase=%s rounds=%d)", snap.status, snap.phase, Array.isArray(snap.rounds) ? snap.rounds.length : 0);
  const countdownEndsAtRaw = snap.countdown?.endsAt as number | undefined;
  if (countdownEndsAtRaw !== undefined) {
    let remain = msUntil(countdownEndsAtRaw) ?? 0;
    console.log("Countdown endsAt=%d (msUntil=%d)", countdownEndsAtRaw, remain);
    const pollInterval = 750;
    while (remain > 0) {
      await new Promise(r => setTimeout(r, Math.min(pollInterval, remain)));
      snap = await getSnapshot(sessionId, creator);
      remain = msUntil(countdownEndsAtRaw) ?? 0;
      process.stdout.write(`.. countdown tick (remain=${remain}) status=${snap.status} round0=${snap.rounds?.[0]?.state}\n`);
    }
    // Grace 1s to allow timer callback to fire
    await new Promise(r => setTimeout(r, 1000));
    snap = await getSnapshot(sessionId, creator);
    console.log("Post-countdown snapshot(status=%s round0=%s currentRound=%s)", snap.status, snap.rounds?.[0]?.state, snap.currentRoundIndex);
  } else {
    console.log("No countdown detected in snapshot; lobby may not have been ready.");
  }

  if (snap.status === "pending" && snap.rounds?.[0]?.state === "queued" && (snap.countdown === undefined)) {
    console.log("Detected stuck state (pending + queued). Attempting force start of round 0 if endpoint exists...");
    if (process.env.FORCE_ROUND_START === "1") {
      try {
        await httpJson(`/activities/session/${sessionId}/round/0/start`, creator, { body: JSON.stringify({ userId: creator }) });
        console.log("Force round start endpoint returned OK.");
        snap = await getSnapshot(sessionId, creator);
        console.log("Snapshot after force(status=%s phase=%s round0=%s)", snap.status, snap.phase, snap.rounds?.[0]?.state);
      } catch (e) {
        console.log("Force round start attempt failed:", (e as Error).message);
      }
    } else {
      console.log("Set FORCE_ROUND_START=1 to attempt manual round start endpoint.");
    }
  }

  console.log("Waiting for session ended event...");
  const ended = await Promise.race([
    sessionEndedViaWs,
    pollForSessionEnded(sessionId, creator),
  ]);
  console.log("Session ended payload:\n", JSON.stringify(ended.payload, null, 2));

  wsAlpha.close(1000, "done");
  wsBravo.close(1000, "done");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
