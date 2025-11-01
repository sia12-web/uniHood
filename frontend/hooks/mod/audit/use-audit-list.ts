"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";

export type AuditEvent = {
	id: string;
	created_at: string;
	actor_id: string | null;
	action: string;
	target_type: string;
	target_id: string | null;
	meta: Record<string, unknown>;
};

export type AuditQuery = {
	target_type?: string;
	target_id?: string;
	actor_id?: string;
	action?: string[];
	from?: string;
	to?: string;
	q?: string;
};

export type AuditListPage = {
	items: AuditEvent[];
	next?: string | null;
	total?: number | null;
	estimated_total?: number | null;
	events_per_minute?: number | null;
};

type UseAuditListOptions = {
	enabled?: boolean;
	limit?: number;
};

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
			.join(",")}}`;
	}
	if (value === undefined) {
		return "undefined";
	}
	return JSON.stringify(value);

}

type BuildParamsOptions = {
	after?: string;
	limit?: number | null;
};

function buildParams(query: AuditQuery, options: BuildParamsOptions = {}): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	if (options.limit !== null) {
		params.limit = options.limit ?? 100;
	}
	if (options.after) {
		params.after = options.after;
	}
	if (query.target_type) params.target_type = query.target_type;
	if (query.target_id) params.target_id = query.target_id;
	if (query.actor_id) params.actor_id = query.actor_id;
	if (query.from) params.from = query.from;
	if (query.to) params.to = query.to;
	if (query.q) params.q = query.q;
	if (query.action?.length) {
		params.action = query.action;
	}
	return params;
}

export function useAuditList(query: AuditQuery, options: UseAuditListOptions = {}) {
	const limit = options.limit ?? 100;
	return useInfiniteQuery<AuditListPage>({
		queryKey: ["mod:audit:list", stableStringify({ query, limit })],
		staleTime: 5_000,
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.next ?? undefined,
		queryFn: async ({ pageParam }) => {
			const cursor = typeof pageParam === "string" ? pageParam : undefined;
			const params = buildParams(query, { after: cursor, limit });
			const response = await modApi.get<AuditListPage>("/admin/audit", { params });
			return response.data;
		},
		enabled: options.enabled ?? true,
	});
}

export function flattenAuditPages(data: AuditListPage[] | undefined): AuditEvent[] {
	if (!data) {
		return [];
	}
	return data.flatMap((page) => page.items ?? []);
}

export function buildAuditQueryParams(query: AuditQuery): Record<string, unknown> {
	return buildParams(query, { limit: null });
}
