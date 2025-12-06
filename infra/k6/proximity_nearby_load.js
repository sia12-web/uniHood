import http from "k6/http";
import { check, sleep } from "k6";

const RATE = Number(__ENV.K6_PROXIMITY_RPS || 200);
const K6_RUN_ID = __ENV.K6_RUN_ID || `k6-proximity-${Date.now().toString(36)}`;
const PROFILE = __ENV.K6_PROFILE || "load";

export const options = {
	scenarios: {
		proximity: {
			executor: "constant-arrival-rate",
			rate: RATE,
			timeUnit: "1s",
			duration: __ENV.K6_DURATION || "3m",
			preAllocatedVUs: Number(__ENV.K6_PREALLOCATED_VUS || Math.max(50, RATE)),
			maxVUs: Number(__ENV.K6_MAX_VUS || Math.max(200, RATE * 2)),
		},
	},
	thresholds: {
		http_req_failed: ["rate<0.01"],
		http_req_duration: ["p(95)<120"],
	},
	tags: {
		testType: "proximity-load",
		profile: PROFILE,
		runId: K6_RUN_ID,
	},
};

const BASE_URL = __ENV.K6_BACKEND_URL || "http://localhost:8000";
const USER_ID = __ENV.K6_USER_ID || "00000000-0000-0000-0000-000000000003";
const CAMPUS_ID = __ENV.K6_CAMPUS_ID || "00000000-0000-0000-0000-0000000000c";
const RADIUS = Number(__ENV.K6_RADIUS_METERS || 250);
const LIMIT = Number(__ENV.K6_LIMIT || 50);

// ===== DISTRIBUTED TRACING =====

/**
 * Generate a random hex string (for trace/span IDs)
 */
function randomHex(length) {
	const chars = "0123456789abcdef";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars[Math.floor(Math.random() * 16)];
	}
	return result;
}

/**
 * Generate W3C traceparent header
 */
function generateTraceparent() {
	const traceId = randomHex(32);
	const spanId = randomHex(16);
	const flags = "01"; // sampled
	return {
		traceparent: `00-${traceId}-${spanId}-${flags}`,
		traceId,
		spanId,
	};
}

/**
 * Create headers with tracing context
 */
function getTracedHeaders() {
	const trace = generateTraceparent();
	return {
		"Content-Type": "application/json",
		"X-User-Id": USER_ID,
		"X-Campus-Id": CAMPUS_ID,
		traceparent: trace.traceparent,
		"x-trace-id": trace.traceId,
		"x-span-id": trace.spanId,
		"x-request-id": `${K6_RUN_ID}-${__VU}-${__ITER}`,
		baggage: `source=k6,profile=${PROFILE},vu=${__VU},iter=${__ITER}`,
	};
}

export default function () {
	if (__ENV.K6_DRY_RUN === "1") {
		sleep(1);
		return;
	}
	const res = http.get(
		`${BASE_URL}/proximity/nearby?radius_m=${RADIUS}&limit=${LIMIT}`,
		{
			headers: getTracedHeaders(),
			tags: { endpoint: "proximity/nearby" },
		},
	);
	check(res, {
		"status is 200": (r) => r.status === 200,
	});
}
