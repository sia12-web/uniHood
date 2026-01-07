import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 8 * 1024;
const COLLECTOR_PATH = "/ops/ui-metrics";

function buildCollectorUrl(): string | null {
	const base =
		process.env.NEXT_PUBLIC_API_BASE_URL ??
		process.env.API_BASE_URL ??
		process.env.MOD_API_BASE_URL ??
		"";
	if (!base) {
		return null;
	}
	const normalised = base.endsWith("/") ? base.slice(0, -1) : base;
	return `${normalised}${COLLECTOR_PATH}`;
}

function validatePayload(raw: string): string | null {
	if (!raw) {
		return "empty_body";
	}
	if (raw.length > MAX_BODY_BYTES) {
		return "payload_too_large";
	}
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) {
			return "invalid_payload";
		}
		// Relaxed: Allow payload without event for generic telemetry
		// if (typeof (parsed as { event?: unknown }).event !== "string") {
		// 	return "missing_event";
		// }
	} catch {
		return "invalid_json";
	}
	return null;
}

export async function POST(request: NextRequest) {
	const raw = await request.text();
	const validationError = validatePayload(raw);
	if (validationError) {
		return NextResponse.json({ error: validationError }, { status: validationError === "payload_too_large" ? 413 : 400 });
	}
	const collector = buildCollectorUrl();
	if (!collector) {
		return NextResponse.json({ status: "ignored" }, { status: 202 });
	}
	try {
		await fetch(collector, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: raw,
			keepalive: true,
		});
	} catch {
		// swallow network errors: metrics are best-effort
	}
	return NextResponse.json({ status: "forwarded" }, { status: 202 });
}
