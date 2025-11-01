'use client';

import { useMutation } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';
import { emitSafetyMetric } from '@/lib/obs/safety';

export type ThresholdChange = {
	metric: string;
	soft_review?: number;
	hard_block?: number;
	soft_clean?: number;
};

export type ThresholdSimulateRequest = {
	kind: 'text' | 'image' | 'url';
	changes: ThresholdChange[];
	lookback_hours?: number;
	sample_size?: number;
};

export type ThresholdSimulateImpact = {
	clean_delta: number;
	review_delta: number;
	quarantine_delta: number;
	block_delta: number;
	false_positive_estimate?: number;
};

export type ThresholdSimulateResponse = {
	token: string;
	impact: ThresholdSimulateImpact;
	generated_at: string;
};

export type ThresholdApplyRequest = {
	token: string;
	note?: string;
};

export type ThresholdApplyResponse = {
	applied: boolean;
	job_id?: string | null;
};

export function useThresholdsSimulate() {
	const simulate = useMutation<ThresholdSimulateResponse, unknown, ThresholdSimulateRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<ThresholdSimulateResponse>('/safety/thresholds/simulate', payload);
			return res.data;
		},
		onSuccess: () => {
			emitSafetyMetric({ event: 'thresholds_simulate' });
		},
	});

	const apply = useMutation<ThresholdApplyResponse, unknown, ThresholdApplyRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<ThresholdApplyResponse>('/safety/thresholds/apply', payload);
			return res.data;
		},
	});

	return { simulate, apply };
}
