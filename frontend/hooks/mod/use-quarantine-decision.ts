'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';
import { emitSafetyMetric } from '@/lib/obs/safety';

export type QuarantineDecisionRequest = {
	id: string;
	verdict: 'clean' | 'tombstone' | 'blocked';
	note?: string;
};

export function useQuarantineDecision() {
	const qc = useQueryClient();
	return useMutation<void, unknown, QuarantineDecisionRequest>({
		mutationFn: async ({ id, verdict, note }) => {
			await modApi.post(`/quarantine/${id}/decision`, { verdict, note });
		},
		onSuccess: (_data, variables) => {
			emitSafetyMetric({ event: 'quarantine_decision', verdict: variables.verdict });
			qc.invalidateQueries({ queryKey: ['mod:quarantine'] });
		},
	});
}
