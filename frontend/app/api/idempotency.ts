const IDEM_TTL_MS = 60_000;
const DEBUG_MAX_ENTRIES = 100;

export type IdemDebugEntry = {
	route: string;
	payloadFingerprint: string;
	idemKey: string;
	requestId: string;
	timestamp: number;
};

type CacheEntry = {
	expiresAt: number;
	idemKey: string;
};

const cache = new Map<string, CacheEntry>();
const debugMap = new Map<string, IdemDebugEntry>();

export async function getOrCreateIdemKey(route: string, payload: unknown): Promise<string> {
	const fingerprint = createFingerprint(route, payload);
	const now = Date.now();
	pruneExpired(now);
	const existing = cache.get(fingerprint);
	if (existing && existing.expiresAt > now) {
		return existing.idemKey;
	}
	const idemKey = `idem_${await sha256Hex(fingerprint)}`;
	cache.set(fingerprint, { idemKey, expiresAt: now + IDEM_TTL_MS });
	return idemKey;
}

export function rememberIdemRequest(params: {
	route: string;
	payload: unknown;
	idemKey: string;
	requestId: string;
}): void {
	const fingerprint = createFingerprint(params.route, params.payload);
	const entry: IdemDebugEntry = {
		route: params.route,
		payloadFingerprint: fingerprint,
		idemKey: params.idemKey,
		requestId: params.requestId,
		timestamp: Date.now(),
	};
	if (debugMap.has(entry.idemKey)) {
		debugMap.delete(entry.idemKey);
	}
	debugMap.set(entry.idemKey, entry);
	trimDebug();
}

export function getRecentIdemRequests(): IdemDebugEntry[] {
	return Array.from(debugMap.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function createFingerprint(route: string, payload: unknown): string {
	const stablePayload = stableStringify(payload);
	return `${route}|${stablePayload}`;
}

function pruneExpired(now: number): void {
	for (const [fingerprint, entry] of cache.entries()) {
		if (entry.expiresAt <= now) {
			cache.delete(fingerprint);
		}
	}
}

function trimDebug(): void {
	while (debugMap.size > DEBUG_MAX_ENTRIES) {
		const oldestKey = debugMap.keys().next().value;
		if (!oldestKey) {
			break;
		}
		debugMap.delete(oldestKey);
	}
}

function stableStringify(value: unknown): string {
	try {
		return JSON.stringify(normalise(value));
	} catch {
		return "__unserializable__";
	}
}

function normalise(value: unknown, seen = new WeakSet<object>()): unknown {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (value instanceof URL) {
		return value.toString();
	}
	if (Array.isArray(value)) {
		return value.map((item) => normalise(item, seen));
	}
	if (value instanceof Map) {
		return Array.from(value.entries())
			.sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
			.map(([k, v]) => [k, normalise(v, seen)]);
	}
	if (value instanceof Set) {
		return Array.from(value.values()).sort().map((item) => normalise(item, seen));
	}
	if (seen.has(value)) {
		return "__cycle__";
	}
	seen.add(value);
	const record = value as Record<string, unknown>;
	const sortedKeys = Object.keys(record).sort();
	const result: Record<string, unknown> = {};
	for (const key of sortedKeys) {
		result[key] = normalise(record[key], seen);
	}
	seen.delete(value);
	return result;
}

async function sha256Hex(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	if (typeof crypto !== "undefined" && crypto.subtle) {
		const digest = await crypto.subtle.digest("SHA-256", data);
		return bufferToHex(new Uint8Array(digest));
	}
	try {
		const { createHash } = await import("crypto");
		return createHash("sha256").update(data).digest("hex");
	} catch {
		return fallbackHash(input);
	}
}

function bufferToHex(buffer: Uint8Array): string {
	return Array.from(buffer)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function fallbackHash(input: string): string {
	let hash = 0;
	for (let i = 0; i < input.length; i += 1) {
		hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
	}
	return hash.toString(16).padStart(8, "0").repeat(4).slice(0, 32);
}
