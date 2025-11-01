'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';

export type HashRecord = {
	id: string;
	algo: string;
	hash: string;
	label?: string | null;
	source?: string | null;
	created_at: string;
	metadata?: Record<string, unknown> | null;
};

export type HashListResponse = {
	items: HashRecord[];
	next?: string | null;
	total?: number;
};

export type HashFilters = {
	search?: string;
	algo?: string;
	label?: string;
	source?: string;
};

const PAGE_SIZE = 100;

function serializeFilters(filters: HashFilters): string {
	return JSON.stringify(
		Object.entries(filters)
			.filter(([, value]) => value !== undefined && value !== null && value !== '')
			.sort(([a], [b]) => a.localeCompare(b))
	);
}

function mapFilters(filters: HashFilters): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	if (filters.search) params.hash = filters.search;
	if (filters.algo) params.algo = filters.algo;
	if (filters.label) params.label = filters.label;
	if (filters.source) params.source = filters.source;
	return params;
}

export function useHashRecords(filters: HashFilters) {
	return useInfiniteQuery<HashListResponse>({
		queryKey: ['mod:hashes', serializeFilters(filters)],
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }) => {
			const res = await modApi.get<HashListResponse>('/hashes', {
				params: {
					...mapFilters(filters),
					after: pageParam ?? undefined,
					limit: PAGE_SIZE,
				},
			});
			return res.data;
		},
		getNextPageParam: (page) => page.next ?? undefined,
		staleTime: 10_000,
	});
}
