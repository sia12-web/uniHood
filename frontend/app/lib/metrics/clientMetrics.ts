import { apiFetch } from "@/app/lib/http/client";

export type MetricEvent = {
	type:
	| "search.query"
	| "feed.render"
	| "socket.state"
	| "invite.send"
	| "message.send"
	| "export.request"
	| "report.submit"
	| "report.fail"
	| "mod.queue.action"
	| "appeal.submit"
	| "appeal.decide"
	| "content.warning.shown";
	timestamp: number;
	payload: Record<string, unknown>;
};

const METRIC_ENDPOINT = "/ops/ux-metrics";
const MAX_BATCH = 10;
const FLUSH_INTERVAL_MS = 5_000;

let buffer: MetricEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

function scheduleFlush() {
	if (flushTimer) {
		return;
	}
	flushTimer = setTimeout(() => {
		flushTimer = null;
		void flush();
	}, FLUSH_INTERVAL_MS);
}

export function enqueue(event: MetricEvent): void {
	if (typeof window !== "undefined" && !window.navigator.onLine) {
		return;
	}
	buffer.push(event);
	if (buffer.length >= MAX_BATCH) {
		void flush();
		return;
	}
	scheduleFlush();
}

export function trackSearchQuery(payload: Record<string, unknown>): void {
	enqueue({ type: "search.query", timestamp: Date.now(), payload });
}

export function trackFeedRender(payload: Record<string, unknown>): void {
	enqueue({ type: "feed.render", timestamp: Date.now(), payload });
}

export function trackSocketState(payload: Record<string, unknown>): void {
	enqueue({ type: "socket.state", timestamp: Date.now(), payload });
}

export function trackInviteSend(payload: Record<string, unknown>): void {
	enqueue({ type: "invite.send", timestamp: Date.now(), payload });
}

export function trackMessageSend(payload: Record<string, unknown>): void {
	enqueue({ type: "message.send", timestamp: Date.now(), payload });
}

export function trackExportRequest(payload: Record<string, unknown>): void {
	enqueue({ type: "export.request", timestamp: Date.now(), payload });
}

async function flush(): Promise<void> {
	if (inFlight || buffer.length === 0) {
		return;
	}
	if (typeof window !== "undefined" && !window.navigator.onLine) {
		buffer = [];
		return;
	}
	const batch = buffer.slice(0, MAX_BATCH);
	buffer = buffer.slice(batch.length);
	inFlight = true;
	try {
		await apiFetch(METRIC_ENDPOINT, {
			method: "POST",
			body: { events: batch },
			cache: "no-store",
		});
	} catch {
		// Drop batch on failure to avoid retry storms.
	} finally {
		inFlight = false;
		if (buffer.length > 0) {
			void flush();
		}
	}
}
