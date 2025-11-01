"use client";

import { useQueries } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";

import { buildQueueParams } from "./use-queue";
import type { CaseListPage } from "./use-queue";

export type QueueSummaryInput = {
	key: string;
	filters?: Record<string, unknown>;
};

export type QueueSummaryResult = {
	key: string;
	count: number | null;
	slaBreaches: number | null;
};

export type QueueSummaryOptions = {
	skipKeys?: Set<string>;
	staleTime?: number;
};

function computeBreaches(items: CaseListPage["items"]): number {
	return items.reduce((total, item) => {
		if (!item.sla_due_at) {
			return total;
		}
		const due = Date.parse(item.sla_due_at);
		if (!Number.isFinite(due)) {
			return total;
		}
		return due < Date.now() ? total + 1 : total;
	}, 0);
}

export function useQueueSummaries(entries: QueueSummaryInput[], options: QueueSummaryOptions = {}) {
	return useQueries({
		queries: entries.map((entry) => ({
			queryKey: ["mod:triage:summary", entry.key, entry.filters ?? {}],
			enabled: !options.skipKeys?.has(entry.key),
			staleTime: options.staleTime ?? 30_000,
			queryFn: async () => {
				const params = { ...buildQueueParams({ queueKey: entry.key, filters: entry.filters }), limit: 50 };
				const response = await modApi.get<CaseListPage>("/admin/cases", { params });
				const items = response.data.items ?? [];
				return {
					key: entry.key,
					count: response.data.total ?? items.length ?? 0,
					slaBreaches: computeBreaches(items),
				};
			},
		})),
	});
}
