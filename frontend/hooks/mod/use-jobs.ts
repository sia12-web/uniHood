'use client';

import { useQuery } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';

export type ModerationJobItem = {
	target_type: string;
	target_id: string;
	ok: boolean | null;
	error?: string | null;
};

export type ModerationJob = {
	id: string;
	job_type: string;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	total: number;
	succeeded: number;
	failed: number;
	initiated_by: string;
	dry_run: boolean;
	created_at: string;
	started_at?: string | null;
	finished_at?: string | null;
	params?: Record<string, unknown>;
	items?: ModerationJobItem[];
};

export type JobsResponse = {
	items: ModerationJob[];
	next?: string | null;
};

export function useJobs(limit = 25) {
	return useQuery<JobsResponse>({
		queryKey: ['mod:jobs', limit],
		staleTime: 5_000,
		queryFn: async () => {
			const res = await modApi.get<JobsResponse>('/admin/tools/jobs', {
				params: { limit },
			});
			return res.data;
		},
		refetchInterval: 15_000,
	});
}

export function useJob(jobId: string | null) {
	return useQuery<ModerationJob>({
		queryKey: ['mod:job', jobId],
		enabled: Boolean(jobId),
		staleTime: 5_000,
		queryFn: async () => {
			const res = await modApi.get<ModerationJob>(`/admin/tools/jobs/${jobId}`);
			return res.data;
		},
	});
}
