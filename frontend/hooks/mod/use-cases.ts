'use client';

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';

export type ModerationCase = {
	id: string;
	severity: number;
	status: string;
	subject_type: string;
	subject_id: string;
	reason: string;
	assigned_to?: string | null;
	updated_at: string;
	created_at: string;
	campus_id: string;
	appeal_open?: boolean;
	escalation_level?: number | null;
};

export type CasesPage = {
	items: ModerationCase[];
	next?: string | null;
	total?: number;
};

export type CasesFilters = {
	status?: string;
	severityMin?: number;
	severityMax?: number;
	subjectType?: string;
	campusId?: string;
	assigned?: 'me' | 'none';
	appeal?: 'open' | 'closed';
	updatedAfter?: string;
	updatedBefore?: string;
};

export type CaseBulkActionRequest = {
	action:
		| 'assign'
		| 'escalate'
		| 'dismiss'
		| 'apply_enforcement';
	case_ids: string[];
	note?: string;
	payload?: Record<string, unknown>;
};

export type CaseBulkActionResponse = {
	job_id?: string;
	queued: boolean;
};

const PAGE_SIZE = 50;

function serializeFilters(filters: CasesFilters): string {
	const ordered = Object.entries(filters)
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.sort(([a], [b]) => a.localeCompare(b));
	return JSON.stringify(Object.fromEntries(ordered));
}

function mapFilters(filters: CasesFilters): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	if (filters.status) params.status = filters.status;
	if (filters.severityMin !== undefined) params.severity_min = filters.severityMin;
	if (filters.severityMax !== undefined) params.severity_max = filters.severityMax;
	if (filters.subjectType) params.subject_type = filters.subjectType;
	if (filters.campusId) params.campus_id = filters.campusId;
	if (filters.assigned) params.assigned = filters.assigned;
	if (filters.appeal) params.appeal = filters.appeal;
	if (filters.updatedAfter) params.updated_after = filters.updatedAfter;
	if (filters.updatedBefore) params.updated_before = filters.updatedBefore;
	return params;
}

export function useCases(filters: CasesFilters) {
	const queryKey = useMemo(() => ['mod:cases', serializeFilters(filters)], [filters]);

	return useInfiniteQuery<CasesPage>({
		queryKey,
		queryFn: async ({ pageParam }) => {
			const res = await modApi.get<CasesPage>('/admin/cases', {
				params: {
					...mapFilters(filters),
					after: pageParam ?? undefined,
					limit: PAGE_SIZE,
				},
			});
			return res.data;
		},
		initialPageParam: null,
		getNextPageParam: (page) => page.next ?? undefined,
		staleTime: 10_000,
	});
}

export function useCasesBulkAction() {
	const qc = useQueryClient();
	return useMutation<CaseBulkActionResponse, unknown, CaseBulkActionRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<CaseBulkActionResponse>('/admin/cases/batch_action', payload);
			return res.data;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['mod:cases'] });
		},
	});
}
