import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 10 * 1024;
const SUPPORTED_METRICS = new Set(["CLS", "LCP", "INP"]);

type SanitisedMetric = {
	id: string;
	name: "CLS" | "LCP" | "INP";
	value: number;
	delta: number;
	rating?: string;
	navigationType?: string;
	page: string;
	timestamp: number;
};

function env(name: string): string | undefined {
	return process.env?.[name];
}

function isEnabled(): boolean {
	if (process.env?.NODE_ENV === "production" && env("OBS_WEB_VITALS_ALLOW_PROD") !== "true") {
		return false;
	}
	return (env("OBS_WEB_VITALS_ENABLED") ?? "").toLowerCase() === "true";
}

function safePage(input: unknown): string {
	if (typeof input !== "string" || !input.trim()) {
		return "/";
	}
	const trimmed = input.trim();
	return trimmed.startsWith("/") ? trimmed.slice(0, 120) : `/${trimmed.slice(0, 119)}`;
}

function round(value: number): number {
	return Number(value.toFixed(4));
}

function sanitiseMetric(raw: unknown): SanitisedMetric | null {
	if (!isRecord(raw)) {
		return null;
	}
	const metric = raw;
	const nameRaw = typeof metric.name === "string" ? metric.name.toUpperCase() : null;
	if (!nameRaw || !SUPPORTED_METRICS.has(nameRaw)) {
		return null;
	}
	const id = typeof metric.id === "string" ? metric.id : null;
	if (!id) {
		return null;
	}
	const value = Number(metric.value);
	if (!Number.isFinite(value)) {
		return null;
	}
	const delta = Number(metric.delta ?? 0);
	const rating = typeof metric.rating === "string" ? metric.rating : undefined;
	const navigationType = typeof metric.navigationType === "string" ? metric.navigationType : undefined;
	const page = safePage(metric.page ?? metric.path);
	return {
		id,
		name: nameRaw as SanitisedMetric["name"],
		value: round(value),
		delta: round(delta),
		rating,
		navigationType,
		page,
		timestamp: Date.now(),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractMetrics(parsed: unknown): unknown[] {
	if (Array.isArray(parsed)) {
		return parsed;
	}
	if (isRecord(parsed)) {
		const candidate = parsed.metrics;
		if (Array.isArray(candidate)) {
			return candidate;
		}
	}
	return [parsed];
}

function normalisePayload(parsed: unknown): SanitisedMetric[] {
	const source = extractMetrics(parsed);
	return source
		.map((entry: unknown) => sanitiseMetric(entry))
		.filter((entry: SanitisedMetric | null): entry is SanitisedMetric => Boolean(entry));
}

async function forwardToCollector(body: string): Promise<void> {
	const collector = env("OBS_WEB_VITALS_COLLECTOR_URL");
	if (!collector) {
		return;
	}
	try {
		await fetch(collector, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
			keepalive: true,
		});
	} catch {
		// ignore failures; frontend ingest is best-effort
	}
}

export async function POST(request: NextRequest) {
	if (!isEnabled()) {
		return NextResponse.json({ status: "disabled" }, { status: 404 });
	}
	const raw = await request.text();
	if (!raw) {
		return NextResponse.json({ error: "empty_body" }, { status: 400 });
	}
	if (raw.length > MAX_BODY_BYTES) {
		return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}
	const metrics = normalisePayload(parsed);
	if (metrics.length === 0) {
		return NextResponse.json({ status: "ignored" }, { status: 202 });
	}
	const payload = JSON.stringify({ metrics, sentAt: new Date().toISOString() });
	if (payload.length > MAX_BODY_BYTES) {
		return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
	}
	await forwardToCollector(payload);
	return NextResponse.json({ status: "accepted" }, { status: 202 });
}
