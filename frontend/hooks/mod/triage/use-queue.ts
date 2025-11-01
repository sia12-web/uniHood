"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";

export type CaseSeverity = 1 | 2 | 3 | 4 | 5;
export type CaseStatus = "open" | "actioned" | "dismissed" | "escalated" | "closed";

export type CaseSummary = {
	id: string;
	severity: CaseSeverity;
	status: CaseStatus;
	subject: string;
	reason?: string | null;
	assigned_to?: string | null;
	assigned_to_name?: string | null;
	appeal_status?: string | null;
	escalation_level?: number | null;
	campus?: string | null;
	created_at: string;
	updated_at?: string | null;
	sla_due_at?: string | null;
	locked_by?: string | null;
	lock_expires_at?: string | null;
	metadata?: Record<string, unknown> | null;
};

export type CaseListQuery = {
	queueKey: string;
	filters?: Record<string, unknown>;
};

export type CaseListPage = {
	items: CaseSummary[];
	next?: string | null;
	total?: number | null;
};

function stableStringify(value: unknown): string {
	return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

export function buildQueueParams(query: CaseListQuery): Record<string, unknown> {
	const params: Record<string, unknown> = { status: "open", limit: 50 };
	switch (query.queueKey) {
		case "sev4":
			params.severity_gte = 4;
			break;
		case "new-24h":
			params.created_from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
			break;
		case "appeals-pending":
			params.appeal_open = true;
			params.status_in = "actioned,dismissed";
			break;
		case "unassigned":
			params.assigned = "none";
			break;
		case "my-claimed":
			params.assigned = "me";
			break;
		case "escalated":
			params.escalation_level_gt = 0;
			break;
		case "quarantine-handoff":
			params.quarantine_handoff = true;
			break;
		default:
			break;
	}
	if (query.filters) {
		Object.assign(params, query.filters);
	}
	return params;
}

export function useQueue(query: CaseListQuery, options: { enabled?: boolean } = {}) {
	return useInfiniteQuery<CaseListPage>({
		queryKey: ["mod:triage:queue", stableStringify({ queue: query.queueKey, filters: query.filters ?? {} })],
		staleTime: 5_000,
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.next ?? undefined,
		queryFn: async ({ pageParam }) => {
			const params = { ...buildQueueParams(query), after: pageParam ?? undefined };
			const response = await modApi.get<CaseListPage>("/admin/cases", { params });
			return response.data;
		},
		enabled: options.enabled ?? true,
	});
}
