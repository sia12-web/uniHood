'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';
import type { ModerationCase } from '@/hooks/mod/use-cases';

export type CaseTimelineEvent = {
	id: string;
	type: string;
	description: string;
	actor?: string | null;
	occurred_at: string;
};

export type CaseReporter = {
	id: string;
	handle?: string | null;
	reports: number;
	is_redacted?: boolean;
};

export type CaseAppeal = {
	id?: string;
	status: string;
	note?: string | null;
	updated_at: string;
	resolved_by?: string | null;
};

export type CaseDetail = ModerationCase & {
	timeline?: CaseTimelineEvent[];
	reporters?: CaseReporter[];
	appeal?: CaseAppeal | null;
	suggested_actions?: string[];
};

export type CaseActionRequest = {
	action: 'assign' | 'escalate' | 'dismiss' | 'apply_enforcement';
	note?: string;
	payload?: Record<string, unknown>;
};

export function useCase(caseId: string) {
	return useQuery<CaseDetail>({
		queryKey: ['mod:case', caseId],
		enabled: Boolean(caseId),
		staleTime: 5_000,
		queryFn: async () => {
			const res = await modApi.get<CaseDetail>(`/admin/cases/${caseId}`);
			return res.data;
		},
	});
}

export function useCaseAction(caseId: string) {
	const qc = useQueryClient();
	return useMutation<CaseDetail, unknown, CaseActionRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<CaseDetail>(`/admin/cases/${caseId}`, payload);
			return res.data;
		},
		onSuccess: (data) => {
			qc.setQueryData(['mod:case', caseId], data);
			qc.invalidateQueries({ queryKey: ['mod:cases'] });
		},
	});
}
