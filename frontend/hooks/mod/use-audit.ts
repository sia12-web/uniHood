'use client';

import { useQuery } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';

export type AuditLogEntry = {
	id: string;
	type: string;
	actor?: string | null;
	message: string;
	created_at: string;
};

export type AuditLogResponse = {
	items: AuditLogEntry[];
};

export function useAudit(targetId: string | null) {
	return useQuery<AuditLogResponse>({
		queryKey: ['mod:audit', targetId],
		enabled: Boolean(targetId),
		staleTime: 5_000,
		queryFn: async () => {
			const res = await modApi.get<AuditLogResponse>('/admin/audit', {
				params: { target_id: targetId },
			});
			return res.data;
		},
	});
}
