import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
	stages: [
		{ duration: "30s", target: 100 },
		{ duration: "1m", target: 300 },
		{ duration: "2m", target: 300 },
		{ duration: "30s", target: 0 },
	],
	thresholds: {
		http_req_failed: ["rate<0.01"],
		http_req_duration: ["p(95)<150"],
	},
};

const BASE_URL = __ENV.K6_BACKEND_URL || "http://localhost:8000";
const USER_ID = __ENV.K6_USER_ID || "00000000-0000-0000-0000-000000000001";
const CAMPUS_ID = __ENV.K6_CAMPUS_ID || "00000000-0000-0000-0000-0000000000c";
const PEER_ID = __ENV.K6_PEER_ID || "00000000-0000-0000-0000-000000000002";

function buildPayload() {
	return JSON.stringify({
		to_user_id: PEER_ID,
		body: `load-test-${__ITER}-${Math.random().toString(16).slice(2)}`,
		client_msg_id: `${Date.now()}-${__ITER}`,
	});
}

export default function () {
	if (__ENV.K6_DRY_RUN === "1") {
		sleep(1);
		return;
	}
	const res = http.post(`${BASE_URL}/chat/messages`, buildPayload(), {
		headers: {
			"Content-Type": "application/json",
			"X-User-Id": USER_ID,
			"X-Campus-Id": CAMPUS_ID,
		},
		tags: { endpoint: "chat/messages" },
	});
	check(res, {
		"status is 201": (r) => r.status === 201,
	});
	sleep(1);
}
