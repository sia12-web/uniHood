'use client';

import { useQuery } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';

export type ThresholdBand = {
	metric: string;
	soft_review: number;
	hard_block: number;
	soft_clean?: number;
};

export type MediaThresholds = {
	kind: 'text' | 'image' | 'url';
	bands: ThresholdBand[];
	updated_at: string;
	updated_by?: string | null;
	snapshot?: Record<string, unknown>;
};

export type SafetyThresholdsResponse = {
	profiles: MediaThresholds[];
};

export function useSafetyThresholds() {
	return useQuery<SafetyThresholdsResponse>({
		queryKey: ['mod:safety:thresholds'],
		staleTime: 30_000,
		queryFn: async () => {
			const res = await modApi.get<SafetyThresholdsResponse>('/safety/thresholds');
			return res.data;
		},
	});
}
