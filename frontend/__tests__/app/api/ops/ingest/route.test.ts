import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { POST } from "@/app/api/ops/ingest/route";

const originalNodeEnv = process.env.NODE_ENV;

function setEnv(key: string, value: string | undefined) {
	const env = process.env as Record<string, string | undefined>;
	if (value === undefined) {
		delete env[key];
	} else {
		env[key] = value;
	}
}

function makeRequest(payload: unknown): NextRequest {
	const body = typeof payload === "string" ? payload : JSON.stringify(payload);
	const init: RequestInit & { duplex?: "half" } = {
		method: "POST",
		body,
		headers: { "content-type": "application/json" },
		duplex: "half",
	};
	return new Request("http://localhost/api/ops/ingest", init) as NextRequest;
}

beforeEach(() => {
	setEnv("NODE_ENV", "development");
	setEnv("OBS_WEB_VITALS_ENABLED", "true");
	setEnv("OBS_WEB_VITALS_COLLECTOR_URL", undefined);
	(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
	vi.clearAllMocks();
	Reflect.deleteProperty(globalThis as Record<string, unknown>, "fetch");
	setEnv("NODE_ENV", originalNodeEnv);
	setEnv("OBS_WEB_VITALS_ENABLED", undefined);
	setEnv("OBS_WEB_VITALS_ALLOW_PROD", undefined);
});

describe("ops ingest route", () => {
	it("returns 404 when disabled", async () => {
		setEnv("OBS_WEB_VITALS_ENABLED", "false");
		const response = await POST(makeRequest({ metrics: [] }));
		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.status).toBe("disabled");
	});

	it("enforces max payload size", async () => {
		const largePage = `/${"x".repeat(11_000)}`;
		const response = await POST(
			makeRequest({ metrics: [{ name: "CLS", id: "big", value: 0.2, page: largePage }] }),
		);
		expect(response.status).toBe(413);
		const body = await response.json();
		expect(body.error).toBe("payload_too_large");
	});

	it("forwards sanitised metrics to collector", async () => {
		setEnv("OBS_WEB_VITALS_COLLECTOR_URL", "https://collector.example/ingest");
		const response = await POST(
			makeRequest({
				metrics: [
					{
						name: "cls",
						id: "metric-1",
						value: 0.23456,
						delta: 0.104,
						rating: "good",
						page: "/rooms",
						extra: "ignored",
					},
				],
				userId: "should-not-send",
			}),
		);

		expect(response.status).toBe(202);
		const fetchMock = vi.mocked((globalThis as any).fetch, true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, options] = fetchMock.mock.calls[0];
		const payload = JSON.parse(options?.body as string);
		expect(payload.metrics[0]).toMatchObject({
			id: "metric-1",
			name: "CLS",
			value: 0.2346,
			delta: 0.104,
			page: "/rooms",
		});
		expect(payload.metrics[0]).not.toHaveProperty("extra");
	});

	it("disables ingestion in production by default", async () => {
		setEnv("NODE_ENV", "production");
		const response = await POST(makeRequest({ metrics: [] }));
		expect(response.status).toBe(404);
	});
});
