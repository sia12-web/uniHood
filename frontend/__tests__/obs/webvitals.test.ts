import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-vitals", () => {
	return {
		onCLS: vi.fn(),
		onINP: vi.fn(),
		onLCP: vi.fn(),
	};
});

const metric = {
	name: "CLS",
	id: "metric-id",
	value: 0.1345,
	delta: 0.0123,
	rating: "good",
	navigationType: "navigate",
} as any;

beforeEach(() => {
	vi.resetModules();
	process.env.NEXT_PUBLIC_OBS_WEB_VITALS_ENABLED = "true";
	Object.defineProperty(globalThis, "location", {
		configurable: true,
		value: { pathname: "/rooms" },
	});
});

afterEach(() => {
	vi.clearAllMocks();
	delete (globalThis as any).navigator;
	delete (globalThis as any).fetch;
});

describe("web vitals reporting", () => {
	it("skips reporting when flag disabled", async () => {
		process.env.NEXT_PUBLIC_OBS_WEB_VITALS_ENABLED = "false";
		const module = await import("@/lib/obs/webvitals");
		const sendBeacon = vi.fn();
		(globalThis as any).navigator = { sendBeacon };

		module.reportWebVitals(metric);

		expect(sendBeacon).not.toHaveBeenCalled();
	});

	it("uses sendBeacon when available", async () => {
		const module = await import("@/lib/obs/webvitals");
		const sendBeacon = vi.fn().mockReturnValue(true);
		(globalThis as any).navigator = { sendBeacon };
		const originalBlob = (globalThis as any).Blob;
		class MockBlob {
			private readonly textValue: string;

			constructor(parts: unknown[]) {
				this.textValue = parts
					.map((part) => (typeof part === "string" ? part : ""))
					.join("");
			}

			text() {
				return Promise.resolve(this.textValue);
			}

			arrayBuffer() {
				return Promise.resolve(new TextEncoder().encode(this.textValue).buffer);
			}
		}
		(globalThis as any).Blob = MockBlob as any;
		try {
			module.reportWebVitals(metric);

			expect(sendBeacon).toHaveBeenCalledTimes(1);
			const payload = sendBeacon.mock.calls[0][1];
			let text: string;
			if (typeof payload === "string") {
				text = payload;
			} else if (payload && typeof (payload as Blob).text === "function") {
				text = await (payload as Blob).text();
			} else if (payload && typeof (payload as Blob).arrayBuffer === "function") {
				const buffer = await (payload as Blob).arrayBuffer();
				text = new TextDecoder().decode(buffer);
			} else {
				text = String(payload ?? "{}");
			}
			const body = JSON.parse(text);
			expect(body.metrics[0]).toMatchObject({ id: "metric-id", name: "CLS", page: "/rooms" });
		} finally {
			(globalThis as any).Blob = originalBlob;
		}
	});

	it("falls back to fetch when sendBeacon unavailable", async () => {
		const module = await import("@/lib/obs/webvitals");
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		(globalThis as any).fetch = fetchMock;

		module.reportWebVitals(metric);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, options] = fetchMock.mock.calls[0];
		const body = JSON.parse(options?.body as string);
		expect(body.metrics).toHaveLength(1);
		expect(body.metrics[0]).not.toHaveProperty("userId");
	});

	it("initialises listeners once", async () => {
		const module = await import("@/lib/obs/webvitals");
		const { onCLS, onINP, onLCP } = await import("web-vitals");

		await module.initWebVitals();
		expect(onCLS).toHaveBeenCalledTimes(1);
		expect(onINP).toHaveBeenCalledTimes(1);
		expect(onLCP).toHaveBeenCalledTimes(1);

		await module.initWebVitals();
		expect(onCLS).toHaveBeenCalledTimes(1);
	});
});
