import http from "k6/http";
import { check, sleep } from "k6";

const RATE = Number(__ENV.K6_PROXIMITY_RPS || 200);

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
};

const BASE_URL = __ENV.K6_BACKEND_URL || "http://localhost:8000";
const USER_ID = __ENV.K6_USER_ID || "00000000-0000-0000-0000-000000000003";
const CAMPUS_ID = __ENV.K6_CAMPUS_ID || "00000000-0000-0000-0000-0000000000c";
const RADIUS = Number(__ENV.K6_RADIUS_METERS || 250);
const LIMIT = Number(__ENV.K6_LIMIT || 50);

export default function () {
	if (__ENV.K6_DRY_RUN === "1") {
		sleep(1);
		return;
	}
	const res = http.get(
		`${BASE_URL}/proximity/nearby?radius_m=${RADIUS}&limit=${LIMIT}`,
		{
			headers: {
				"X-User-Id": USER_ID,
				"X-Campus-Id": CAMPUS_ID,
			},
			tags: { endpoint: "proximity/nearby" },
		},
	);
	check(res, {
		"status is 200": (r) => r.status === 200,
	});
}
