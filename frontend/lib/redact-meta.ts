"use client";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type RedactOptions = {
	isAdmin?: boolean;
	allowlist?: string[];
};

const DEFAULT_ALLOWLIST = new Set([
	"case_id",
	"subject_id",
	"target_type",
	"target_id",
	"action",
	"actor_id",
	"status",
	"severity",
	"assigned_to",
	"assigned_to_name",
	"appeal_status",
	"note",
	"reason",
	"before",
	"after",
	"diff",
	"fields",
	"changes",
]);

function shouldExpose(path: string[], allowlist: Set<string>): boolean {
	if (!path.length) {
		return true;
	}
	return allowlist.has(path[0]);
}

function redactValue(value: Json, path: string[], allowlist: Set<string>): Json {
	if (!shouldExpose(path, allowlist)) {
		return "[redacted]";
	}
	if (Array.isArray(value)) {
		return value.map((entry, index) => redactValue(entry, [...path, String(index)], allowlist));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, redactValue(entry as Json, [...path, key], allowlist)]),
		);
	}
	return value;
}

export function redactMeta(meta: Record<string, unknown>, options: RedactOptions = {}): Record<string, Json> {
	if (options.isAdmin) {
		return meta as Record<string, Json>;
	}
	const allowlist = new Set([...DEFAULT_ALLOWLIST, ...(options.allowlist ?? [])]);
	return redactValue(meta as Json, [], allowlist) as Record<string, Json>;
}
