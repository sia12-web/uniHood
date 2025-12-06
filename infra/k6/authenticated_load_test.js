/**
 * K6 Authenticated API Load Test
 * 
 * Tests protected endpoints with proper authentication.
 * Logs in during setup and uses tokens for all requests.
 * 
 * Usage:
 *   k6 run --env TEST_EMAIL=user@test.com --env TEST_PASSWORD=pass123 authenticated_load_test.js
 *   k6 run --env BASE_URL=http://localhost:8000 authenticated_load_test.js
 * 
 * Scenarios:
 *   - profile_fetch: User profile operations
 *   - discovery: Discovery feed and nearby users
 *   - social: Friends and invites
 *   - chat: Chat roster and messages
 *   - leaderboards: Activity rankings
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.2.0/index.js";

import { login, authHeaders, BASE_URL } from "./auth-helpers.js";
import { DEFAULT_THRESHOLDS } from "./thresholds.js";

// Custom metrics
const authErrors = new Counter("auth_errors");
const endpointLatency = new Trend("endpoint_latency", true);
const endpointErrors = new Rate("endpoint_errors");

// Test configuration
export const options = {
  scenarios: {
    // Ramp up authenticated users
    authenticated_load: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 5 },   // Ramp up to 5 users
        { duration: "2m", target: 10 },   // Increase to 10 users
        { duration: "1m", target: 10 },   // Steady state
        { duration: "30s", target: 0 },   // Ramp down
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    "auth_errors": ["count<10"],
    "endpoint_errors": ["rate<0.1"],
    "endpoint_latency{endpoint:profile}": ["p(95)<300"],
    "endpoint_latency{endpoint:discovery}": ["p(95)<500"],
    "endpoint_latency{endpoint:friends}": ["p(95)<400"],
    "endpoint_latency{endpoint:chat}": ["p(95)<400"],
    "endpoint_latency{endpoint:leaderboard}": ["p(95)<500"],
  },
};

// Shared auth state per VU
let authState = null;

// Setup: login once per test run (for validation)
export function setup() {
  console.log(`[Setup] Testing auth with BASE_URL=${BASE_URL}`);
  
  const auth = login();
  if (!auth) {
    console.warn("[Setup] Initial login failed - tests will attempt individual logins");
    return { setupAuth: null };
  }
  
  console.log(`[Setup] Auth successful for user: ${auth.userId}`);
  return { setupAuth: auth };
}

// Generate W3C traceparent header
function generateTraceparent() {
  const version = "00";
  const traceId = Array.from({ length: 32 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  const spanId = Array.from({ length: 16 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  const flags = "01"; // sampled
  return `${version}-${traceId}-${spanId}-${flags}`;
}

// Make authenticated request with tracing
function authRequest(method, endpoint, payload = null, tags = {}) {
  if (!authState) {
    authState = login();
    if (!authState) {
      authErrors.add(1);
      return null;
    }
  }
  
  const url = `${BASE_URL}${endpoint}`;
  const params = {
    headers: {
      ...authHeaders(authState.accessToken),
      "traceparent": generateTraceparent(),
    },
    tags: { ...tags },
  };
  
  const startTime = Date.now();
  let response;
  
  if (method === "GET") {
    response = http.get(url, params);
  } else if (method === "POST") {
    response = http.post(url, payload ? JSON.stringify(payload) : null, params);
  } else if (method === "PUT") {
    response = http.put(url, payload ? JSON.stringify(payload) : null, params);
  } else if (method === "DELETE") {
    response = http.del(url, null, params);
  }
  
  const latency = Date.now() - startTime;
  
  // Record metrics
  if (tags.endpoint) {
    endpointLatency.add(latency, { endpoint: tags.endpoint });
  }
  
  // Handle 401 - try to re-authenticate
  if (response && response.status === 401) {
    console.log(`[Auth] Token expired, re-authenticating...`);
    authState = login();
    if (authState) {
      // Retry the request
      params.headers = {
        ...authHeaders(authState.accessToken),
        "traceparent": generateTraceparent(),
      };
      if (method === "GET") {
        response = http.get(url, params);
      } else if (method === "POST") {
        response = http.post(url, payload ? JSON.stringify(payload) : null, params);
      }
    }
  }
  
  if (!response || response.status >= 400) {
    endpointErrors.add(1);
  }
  
  return response;
}

// Main test function
export default function(data) {
  // Test profile endpoints
  group("Profile Operations", () => {
    // Get own profile
    const profileRes = authRequest("GET", `/profile/me`, null, {
      name: "profile:me",
      endpoint: "profile",
    });
    
    if (profileRes) {
      check(profileRes, {
        "profile status is 200": (r) => r.status === 200,
        "profile has user_id": (r) => {
          try {
            return Boolean(JSON.parse(r.body).user_id);
          } catch {
            return false;
          }
        },
      });
    }
    
    sleep(randomIntBetween(1, 2));
  });
  
  // Test discovery endpoints
  group("Discovery Feed", () => {
    const userId = authState?.userId;
    const campusId = authState?.campusId;
    
    if (userId && campusId) {
      const discoveryRes = authRequest(
        "GET", 
        `/discovery/feed?campus_id=${campusId}&limit=20`,
        null,
        { name: "discovery:feed", endpoint: "discovery" }
      );
      
      if (discoveryRes) {
        check(discoveryRes, {
          "discovery status is 200": (r) => r.status === 200,
          "discovery has items": (r) => {
            try {
              const body = JSON.parse(r.body);
              return Array.isArray(body.items);
            } catch {
              return false;
            }
          },
        });
      }
    }
    
    sleep(randomIntBetween(2, 4));
  });
  
  // Test social endpoints
  group("Social - Friends", () => {
    // Get friends list
    const friendsRes = authRequest("GET", "/friends/list", null, {
      name: "social:friends",
      endpoint: "friends",
    });
    
    if (friendsRes) {
      check(friendsRes, {
        "friends status is 200": (r) => r.status === 200,
      });
    }
    
    // Get invite inbox
    const inboxRes = authRequest("GET", "/invites/inbox", null, {
      name: "social:inbox",
      endpoint: "friends",
    });
    
    if (inboxRes) {
      check(inboxRes, {
        "inbox status is 200": (r) => r.status === 200,
      });
    }
    
    sleep(randomIntBetween(1, 3));
  });
  
  // Test chat roster
  group("Chat Roster", () => {
    const chatRes = authRequest("GET", "/chat/roster", null, {
      name: "chat:roster",
      endpoint: "chat",
    });
    
    if (chatRes) {
      check(chatRes, {
        "chat roster status is 200 or 404": (r) => r.status === 200 || r.status === 404,
      });
    }
    
    sleep(randomIntBetween(1, 2));
  });
  
  // Test leaderboards
  group("Leaderboards", () => {
    const leaderboardRes = authRequest("GET", "/leaderboards/typing/top", null, {
      name: "leaderboard:typing",
      endpoint: "leaderboard",
    });
    
    if (leaderboardRes) {
      check(leaderboardRes, {
        "leaderboard status is 200": (r) => r.status === 200,
      });
    }
    
    sleep(randomIntBetween(2, 4));
  });
  
  // Simulate user think time between operations
  sleep(randomIntBetween(3, 6));
}

// Teardown
export function teardown(data) {
  console.log("[Teardown] Test completed");
}

// Generate summary
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summaryPath = `../../perf-results/k6-auth-${timestamp}.json`;
  
  console.log("\n=== Authenticated Load Test Summary ===");
  console.log(`Total requests: ${data.metrics.http_reqs?.values?.count || 0}`);
  console.log(`Auth errors: ${data.metrics.auth_errors?.values?.count || 0}`);
  console.log(`Endpoint error rate: ${((data.metrics.endpoint_errors?.values?.rate || 0) * 100).toFixed(2)}%`);
  
  // Log P95 latencies by endpoint
  const endpoints = ["profile", "discovery", "friends", "chat", "leaderboard"];
  for (const ep of endpoints) {
    const metric = data.metrics[`endpoint_latency{endpoint:${ep}}`];
    if (metric?.values?.["p(95)"]) {
      console.log(`${ep} P95: ${metric.values["p(95)"].toFixed(0)}ms`);
    }
  }
  
  return {
    stdout: JSON.stringify(data, null, 2),
    [summaryPath]: JSON.stringify(data, null, 2),
  };
}
