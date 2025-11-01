'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';
import { emitSafetyMetric } from '@/lib/obs/safety';

export type QuarantineRevealRequest = {
	attachmentId: string;
	note: string;
};

export type QuarantineRevealResponse = {
	revealed: boolean;
	expires_at?: string | null;
	preview_url?: string | null;
};

export function useQuarantineReveal() {
	const qc = useQueryClient();
	return useMutation<QuarantineRevealResponse, unknown, QuarantineRevealRequest>({
		mutationFn: async ({ attachmentId, note }) => {
			const res = await modApi.post<QuarantineRevealResponse>(`/attachments/${attachmentId}/reveal`, { note });
			return res.data;
		},
		onSuccess: (_data, variables) => {
			emitSafetyMetric({ event: 'quarantine_reveal' });
			qc.invalidateQueries({ queryKey: ['mod:q:item', variables.attachmentId] });
		},
	});
}
