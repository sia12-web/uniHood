'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';

export type MacroTargetSelector =
	| { kind: 'cases'; ids: string[] }
	| { kind: 'subjects'; subject_type: string; ids: string[] }
	| {
		kind: 'query';
		subject_type: 'post' | 'comment';
		filter: Record<string, unknown>;
	};

export type RunMacroRequest = {
	macro: string;
	selector: MacroTargetSelector;
	dry_run?: boolean;
	sample_size?: number;
	reason_note?: string;
	variables?: Record<string, unknown>;
};

export type MacroPlanStep = {
	use: string;
	vars?: Record<string, unknown>;
	when?: Record<string, unknown> | null;
};

export type MacroPlanTarget = {
	target: string;
	steps: MacroPlanStep[];
};

export type MacroPlanResponse = {
	count: number;
	plan: MacroPlanTarget[];
};

export type MacroExecuteResponse = {
	job_id: string;
	queued: boolean;
};

export function useMacroRunner() {
	const qc = useQueryClient();
	const [plan, setPlan] = useState<MacroPlanResponse | null>(null);

	const simulate = useMutation<MacroPlanResponse, unknown, RunMacroRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<MacroPlanResponse>('/admin/tools/simulate/macro', payload);
			return res.data;
		},
		onSuccess: (data, request) => {
			setPlan(data);
			qc.setQueryData(['mod:macro:plan', request.macro, JSON.stringify(request.selector)], data);
		},
	});

	const execute = useMutation<MacroExecuteResponse, unknown, RunMacroRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<MacroExecuteResponse>('/admin/tools/run/macro', {
				...payload,
				dry_run: false,
			});
			return res.data;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['mod:jobs'] });
		},
	});

	const resetPlan = useMemo(() => () => setPlan(null), []);

	return {
		plan,
		resetPlan,
		simulate,
		execute,
	};
}
