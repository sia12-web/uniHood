import type { Metric } from "web-vitals";

const INGEST_PATH = "/api/ops/ingest";
const ENABLE_FLAG = "NEXT_PUBLIC_OBS_WEB_VITALS_ENABLED";
const MAX_PAYLOAD_BYTES = 10 * 1024;
const SUPPORTED_METRICS = new Set(["CLS", "LCP", "INP"]);

type SupportedName = "CLS" | "LCP" | "INP";

type NormalisedMetric = {
	id: string;
	name: SupportedName;
	value: number;
	delta: number;
	rating: Metric["rating"];
	navigationType?: Metric["navigationType"];
	page: string;
	timestamp: number;
};

let registered = false;

function readEnv(name: string): string | undefined {
	const maybeProcess = typeof process !== "undefined" ? (process as { env?: Record<string, string | undefined> }) : undefined;
	if (maybeProcess?.env) {
		return maybeProcess.env[name];
	}
	if (typeof globalThis === "object" && globalThis !== null) {
		const globalProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
		if (globalProcess?.env) {
			return globalProcess.env[name];
		}
	}
	return undefined;
}

function currentPage(): string {
	if (typeof location !== "undefined" && location?.pathname) {
		return location.pathname || "/";
	}
	return "/";
}

function toFixed(value: number): number {
	return Number(value.toFixed(4));
}

function sanitise(metric: Metric): NormalisedMetric | null {
	if (!SUPPORTED_METRICS.has(metric.name)) {
		return null;
	}
	const id = metric.id;
	if (typeof id !== "string" || !id) {
		return null;
	}
	const value = Number(metric.value);
	if (!Number.isFinite(value)) {
		return null;
	}
	const delta = Number(metric.delta ?? 0);
	return {
		id,
		name: metric.name as SupportedName,
		value: toFixed(value),
		delta: toFixed(delta),
		rating: metric.rating,
		navigationType: metric.navigationType,
		page: currentPage(),
		timestamp: Date.now(),
	};
}

function buildPayload(metric: Metric): string | null {
	const normalised = sanitise(metric);
	if (!normalised) {
		return null;
	}
	const body = JSON.stringify({ metrics: [normalised] });
	if (body.length > MAX_PAYLOAD_BYTES) {
		return null;
	}
	return body;
}

function sendWithBeacon(body: string): boolean {
		if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
		return false;
	}
	try {
		if (typeof Blob !== "undefined") {
			const blob = new Blob([body], { type: "application/json" });
			return navigator.sendBeacon(INGEST_PATH, blob);
		}
			return navigator.sendBeacon(INGEST_PATH, body);
	} catch {
		return false;
	}
}

function sendWithFetch(body: string): void {
	if (typeof fetch !== "function") {
		return;
	}
	void fetch(INGEST_PATH, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
		keepalive: true,
	}).catch(() => undefined);
}

export function isWebVitalsEnabled(): boolean {
	return (readEnv(ENABLE_FLAG) ?? "").toLowerCase() === "true";
}

export function reportWebVitals(metric: Metric): void {
	if (!isWebVitalsEnabled()) {
		return;
	}
	const body = buildPayload(metric);
	if (!body) {
		return;
	}
	if (!sendWithBeacon(body)) {
		sendWithFetch(body);
	}
}

export async function initWebVitals(): Promise<void> {
	if (registered || !isWebVitalsEnabled()) {
		return;
	}
	registered = true;
	const { onCLS, onINP, onLCP } = await import("web-vitals");
	const handler = (metric: Metric) => reportWebVitals(metric);
	onCLS(handler, { reportAllChanges: true });
	onINP(handler);
	onLCP(handler);
}
