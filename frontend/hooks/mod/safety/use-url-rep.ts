'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';
import { emitSafetyMetric } from '@/lib/obs/safety';

export type UrlSubject = {
	id: string;
	type: string;
	title?: string | null;
	permalink?: string | null;
};

export type UrlScanRecord = {
	id: string;
	url: string;
	final_url?: string | null;
	etld1?: string | null;
	verdict: string;
	lists?: string[] | null;
	first_seen: string;
	last_seen?: string | null;
	subjects?: UrlSubject[];
	redirect_chain?: string[] | null;
};

export type UrlScanResponse = {
	items: UrlScanRecord[];
	next?: string | null;
	total?: number;
};

export type UrlRepFilters = {
	query?: string;
	finalUrl?: string;
	etld1?: string;
	verdict?: string;
};

const PAGE_SIZE = 100;

function serializeFilters(filters: UrlRepFilters): string {
	return JSON.stringify(
		Object.entries(filters)
			.filter(([, value]) => value !== undefined && value !== null && value !== '')
			.sort(([a], [b]) => a.localeCompare(b))
	);
}

function mapFilters(filters: UrlRepFilters): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	if (filters.query) params.url = filters.query;
	if (filters.finalUrl) params.final_url = filters.finalUrl;
	if (filters.etld1) params.etld1 = filters.etld1;
	if (filters.verdict) params.verdict = filters.verdict;
	return params;
}

export function useUrlReputation(filters: UrlRepFilters) {
	return useInfiniteQuery<UrlScanResponse>({
		queryKey: ['mod:url', serializeFilters(filters)],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }) => {
			const res = await modApi.get<UrlScanResponse>('/url_scans', {
				params: {
					...mapFilters(filters),
					after: pageParam ?? undefined,
					limit: PAGE_SIZE,
				},
			});
			emitSafetyMetric({ event: 'url_query' });
			return res.data;
		},
		getNextPageParam: (page) => page.next ?? undefined,
		staleTime: 10_000,
	});
}
