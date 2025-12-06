/**
 * K6 API Endpoint Load Test Suite
 * 
 * Tests multiple API endpoints with specific performance budgets.
 * Includes distributed tracing for correlation with backend/frontend metrics.
 * 
 * Usage:
 *   k6 run -e K6_BACKEND_URL=http://localhost:8000 api_load_test.js
 *   k6 run -e K6_PROFILE=stress api_load_test.js  # stress test
 *   k6 run -e K6_PROFILE=smoke api_load_test.js   # quick validation
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import {
  DEFAULT_THRESHOLDS,
  LOAD_PROFILES,
  ENDPOINT_THRESHOLDS,
  mergeThresholds,
} from "./thresholds.js";

// Custom metrics for tracking per-endpoint performance
const authLatency = new Trend("auth_latency", true);
const chatLatency = new Trend("chat_latency", true);
const discoveryLatency = new Trend("discovery_latency", true);
const profileLatency = new Trend("profile_latency", true);
const errorRate = new Rate("errors");
const requestCount = new Counter("requests");

// Configuration
const BASE_URL = __ENV.K6_BACKEND_URL || "http://localhost:8000";
const PROFILE = __ENV.K6_PROFILE || "load";
const K6_RUN_ID = __ENV.K6_RUN_ID || `k6-${Date.now().toString(36)}`;

export const options = {
  ...LOAD_PROFILES[PROFILE],
  thresholds: mergeThresholds(
    DEFAULT_THRESHOLDS,
    {
      auth_latency: ["p(95)<200"],
      chat_latency: ["p(95)<100"],
      discovery_latency: ["p(95)<500"],
      profile_latency: ["p(95)<150"],
      errors: ["rate<0.01"],
    }
  ),
  tags: {
    testType: "api-load",
    profile: PROFILE,
    runId: K6_RUN_ID,
  },
};

// Test data
const TEST_USER = {
  id: __ENV.K6_USER_ID || "00000000-0000-0000-0000-000000000001",
  campus_id: __ENV.K6_CAMPUS_ID || "00000000-0000-0000-0000-0000000000c",
};

// ===== DISTRIBUTED TRACING =====

/**
 * Generate a random hex string (for trace/span IDs)
 */
function randomHex(length) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/**
 * Generate W3C traceparent header
 * Format: {version}-{trace-id}-{span-id}-{flags}
 */
function generateTraceparent() {
  const traceId = randomHex(32);  // 128-bit trace ID
  const spanId = randomHex(16);   // 64-bit span ID
  const flags = '01';             // sampled
  return {
    traceparent: `00-${traceId}-${spanId}-${flags}`,
    traceId,
    spanId,
  };
}

/**
 * Create headers with tracing context
 */
function getTracedHeaders(endpoint) {
  const trace = generateTraceparent();
  return {
    "Content-Type": "application/json",
    "X-User-Id": TEST_USER.id,
    "X-Campus-Id": TEST_USER.campus_id,
    // W3C Trace Context headers
    "traceparent": trace.traceparent,
    "x-trace-id": trace.traceId,
    "x-span-id": trace.spanId,
    "x-request-id": `${K6_RUN_ID}-${__VU}-${__ITER}`,
    // Baggage for additional context
    "baggage": `source=k6,profile=${PROFILE},vu=${__VU},iter=${__ITER}`,
  };
}

// Common headers (legacy, without tracing - for backwards compatibility)
const headers = {
  "Content-Type": "application/json",
  "X-User-Id": TEST_USER.id,
  "X-Campus-Id": TEST_USER.campus_id,
};

/**
 * Health check - should be near instant
 */
function testHealthCheck() {
  const res = http.get(`${BASE_URL}/health`, { 
    headers: getTracedHeaders("health"),
    tags: { endpoint: "health" },
  });
  
  check(res, {
    "health: status 200": (r) => r.status === 200,
    "health: latency < 50ms": (r) => r.timings.duration < 50,
  });
  
  requestCount.add(1);
  return res.status === 200;
}

/**
 * Auth endpoints
 */
function testAuth() {
  group("auth", () => {
    const tracedHeaders = getTracedHeaders("auth/me");
    
    // Token validation (simulated)
    const res = http.get(`${BASE_URL}/auth/me`, {
      headers: tracedHeaders,
      tags: { endpoint: "auth/me", traceId: tracedHeaders["x-trace-id"] },
    });
    
    authLatency.add(res.timings.duration);
    requestCount.add(1);
    
    const success = check(res, {
      "auth: status 200 or 401": (r) => [200, 401].includes(r.status),
      "auth: latency < 200ms": (r) => r.timings.duration < 200,
    });
    
    if (!success) errorRate.add(1);
  });
}

/**
 * Chat endpoints
 */
function testChat() {
  group("chat", () => {
    const listHeaders = getTracedHeaders("chat/messages/list");
    
    // Get recent messages
    const listRes = http.get(`${BASE_URL}/chat/messages?limit=20`, {
      headers: listHeaders,
      tags: { endpoint: "chat/messages/list", traceId: listHeaders["x-trace-id"] },
    });
    
    chatLatency.add(listRes.timings.duration);
    requestCount.add(1);
    
    check(listRes, {
      "chat list: status 200": (r) => r.status === 200,
      "chat list: latency < 100ms": (r) => r.timings.duration < 100,
    });
    
    // Send message (if not dry run)
    if (__ENV.K6_DRY_RUN !== "1") {
      const sendHeaders = getTracedHeaders("chat/messages/send");
      const sendRes = http.post(
        `${BASE_URL}/chat/messages`,
        JSON.stringify({
          to_user_id: "00000000-0000-0000-0000-000000000002",
          body: `load-test-${Date.now()}`,
          client_msg_id: `k6-${__VU}-${__ITER}`,
        }),
        { headers: sendHeaders, tags: { endpoint: "chat/messages/send", traceId: sendHeaders["x-trace-id"] } }
      );
      
      chatLatency.add(sendRes.timings.duration);
      requestCount.add(1);
      
      const success = check(sendRes, {
        "chat send: status 201": (r) => r.status === 201,
        "chat send: latency < 150ms": (r) => r.timings.duration < 150,
      });
      
      if (!success) errorRate.add(1);
    }
  });
}

/**
 * Discovery/search endpoints
 */
function testDiscovery() {
  group("discovery", () => {
    const tracedHeaders = getTracedHeaders("discover/nearby");
    
    const res = http.get(`${BASE_URL}/discover/nearby?lat=40.7128&lng=-74.006&radius=5000`, {
      headers: tracedHeaders,
      tags: { endpoint: "discover/nearby", traceId: tracedHeaders["x-trace-id"] },
    });
    
    discoveryLatency.add(res.timings.duration);
    requestCount.add(1);
    
    const success = check(res, {
      "discovery: status 200": (r) => r.status === 200,
      "discovery: latency < 500ms": (r) => r.timings.duration < 500,
    });
    
    if (!success) errorRate.add(1);
  });
}

/**
 * Profile endpoints
 */
function testProfile() {
  group("profile", () => {
    const tracedHeaders = getTracedHeaders("users/profile");
    
    const res = http.get(`${BASE_URL}/users/${TEST_USER.id}`, {
      headers: tracedHeaders,
      tags: { endpoint: "users/profile", traceId: tracedHeaders["x-trace-id"] },
    });
    
    profileLatency.add(res.timings.duration);
    requestCount.add(1);
    
    const success = check(res, {
      "profile: status 200 or 404": (r) => [200, 404].includes(r.status),
      "profile: latency < 150ms": (r) => r.timings.duration < 150,
    });
    
    if (!success) errorRate.add(1);
  });
}

/**
 * Main test scenario
 */
export default function () {
  // Health check on first iteration only
  if (__ITER === 0) {
    if (!testHealthCheck()) {
      console.error("Health check failed, aborting test");
      return;
    }
  }
  
  // Weighted distribution of endpoint calls
  const rand = Math.random();
  
  if (rand < 0.1) {
    // 10% auth requests
    testAuth();
  } else if (rand < 0.5) {
    // 40% chat requests (most common)
    testChat();
  } else if (rand < 0.7) {
    // 20% discovery requests
    testDiscovery();
  } else {
    // 30% profile requests
    testProfile();
  }
  
  // Think time between requests
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5s
}

/**
 * Setup function - runs once before test
 */
export function setup() {
  console.log(`Starting ${PROFILE} test against ${BASE_URL}`);
  console.log(`Test user: ${TEST_USER.id}`);
  
  // Verify backend is reachable (try docs or openapi endpoint)
  let res = http.get(`${BASE_URL}/docs`);
  if (res.status !== 200) {
    // Try openapi as fallback
    res = http.get(`${BASE_URL}/openapi.json`);
  }
  if (res.status !== 200) {
    console.warn(`Backend health check returned ${res.status}, proceeding anyway`);
  }
  
  return { startTime: Date.now() };
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration.toFixed(1)}s`);
}

/**
 * Handle summary output
 */
export function handleSummary(data) {
  const outputDir = __ENV.K6_OUTPUT_DIR || '.';
  const summary = {
    timestamp: new Date().toISOString(),
    profile: PROFILE,
    runId: K6_RUN_ID,
    metrics: {
      requests: data.metrics.requests?.values?.count || 0,
      errors: data.metrics.errors?.values?.rate || 0,
      latency: {
        auth_p95: data.metrics.auth_latency?.values?.["p(95)"] || null,
        chat_p95: data.metrics.chat_latency?.values?.["p(95)"] || null,
        discovery_p95: data.metrics.discovery_latency?.values?.["p(95)"] || null,
        profile_p95: data.metrics.profile_latency?.values?.["p(95)"] || null,
      },
    },
    thresholds: Object.entries(data.metrics)
      .filter(([_, v]) => v.thresholds)
      .reduce((acc, [k, v]) => {
        acc[k] = v.thresholds;
        return acc;
      }, {}),
  };
  
  const result = {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
  };
  
  // Only write file if output directory is specified
  if (__ENV.K6_OUTPUT_DIR) {
    result[`${outputDir}/api_load_summary.json`] = JSON.stringify(summary, null, 2);
  }
  
  return result;
}

// Import textSummary from k6-summary lib
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
