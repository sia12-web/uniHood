const WebSocket = require("ws");

const baseHttp = process.env.ACTIVITIES_BASE_URL ?? "http://127.0.0.1:4005";
const baseWs = baseHttp.replace(/^http/, "ws");
const secret = (process.env.API_BEARER_TOKEN ?? "devtoken").trim();

const participants = ["user-alpha", "user-bravo"];
const creator = participants[0];

function authHeader(userId, ...flags) {
  const suffix = [userId, ...flags].filter(Boolean).join(":");
  return secret ? `Bearer ${secret}:${suffix}` : `Bearer ${suffix}`;
}

async function httpJson(path, userId, options = {}) {
  const response = await fetch(`${baseHttp}${path}`, {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(userId),
      ...(options.headers ?? {}),
    },
    body: options.body ?? "{}",
  });
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
    throw new Error(`Failed to parse JSON response: ${error.message}\n${text}`);
  }
}

async function createSession() {
  const payload = {
    activityKey: "speed_typing",
    creatorUserId: creator,
    participants: [...participants],
  };
  const data = await httpJson("/activities/session", creator, { body: JSON.stringify(payload) });
  return data.sessionId;
}

async function joinSession(sessionId, userId) {
  await httpJson(`/activities/session/${sessionId}/join`, userId, {
    body: JSON.stringify({ userId }),
  });
}

async function readyUp(sessionId, userId) {
  await httpJson(`/activities/session/${sessionId}/ready`, userId, {
    body: JSON.stringify({ userId, ready: true }),
  });
}

async function startSession(sessionId) {
  await httpJson(`/activities/session/${sessionId}/start`, creator, { body: "{}" });
}

function waitForRoundSample(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for round payload"));
    }, 30_000);

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw));
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

function waitForSessionEnded(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for session ended"));
    }, 30_000);

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw));
        if (data.type === "activity.session.ended") {
          clearTimeout(timeout);
          resolve(data);
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

async function main() {
  console.log("Creating session...");
  const sessionId = await createSession();
  console.log(`Session ${sessionId}`);

  for (const user of participants) {
    console.log(`Joining ${user}...`);
    await joinSession(sessionId, user);
  }

  console.log("Opening WebSocket for user-alpha...");
  const wsAlpha = new WebSocket(`${baseWs}/activities/session/${sessionId}/stream`, {
    headers: {
      Authorization: authHeader(participants[0]),
    },
  });

  await new Promise((resolve, reject) => {
    wsAlpha.once("open", resolve);
    wsAlpha.once("error", reject);
  });
  console.log("WebSocket connected");

  console.log("Marking participants ready...");
  for (const user of participants) {
    await readyUp(sessionId, user);
  }

  console.log("Starting session...");
  await startSession(sessionId);

  console.log("Waiting for round text sample...");
  const sample = await waitForRoundSample(wsAlpha);
  console.log(`Sample text (${sample.length} chars): ${sample}`);

  console.log("Submitting round for user-alpha...");
  wsAlpha.send(
    JSON.stringify({
      type: "submit",
      payload: {
        userId: participants[0],
        typedText: sample,
        clientMs: 12_345,
      },
    }),
  );

  console.log("Waiting for session ended event...");
  const ended = await waitForSessionEnded(wsAlpha);
  console.log("Session ended payload:\n", JSON.stringify(ended.payload, null, 2));

  wsAlpha.close(1000, "done");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
