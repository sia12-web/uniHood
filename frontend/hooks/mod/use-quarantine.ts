'use client';

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';

export type QuarantineItem = {
	id: string;
	status: 'needs_review' | 'quarantined' | 'released';
	type: 'image' | 'video' | 'file' | 'text';
	owner_id: string;
	owner_handle?: string | null;
	preview_url?: string | null;
	scores?: Record<string, number>;
	ocr_snippet?: string | null;
	subject_id?: string | null;
	subject_type?: string | null;
	campus_id?: string | null;
	captured_at: string;
};

export type QuarantineResponse = {
	items: QuarantineItem[];
	next?: string | null;
};

export type QuarantineFilters = {
	status?: 'needs_review' | 'quarantined';
	type?: 'image' | 'file';
	campusId?: string;
	capturedAfter?: string;
	capturedBefore?: string;
};

const PAGE_SIZE = 30;

function serializeFilters(filters: QuarantineFilters): string {
	const ordered = Object.entries(filters)
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.sort(([a], [b]) => a.localeCompare(b));
	return JSON.stringify(Object.fromEntries(ordered));
}

function mapFilters(filters: QuarantineFilters): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	if (filters.status) params.status = filters.status;
	if (filters.type) params.type = filters.type;
	if (filters.campusId) params.campus_id = filters.campusId;
	if (filters.capturedAfter) params.captured_after = filters.capturedAfter;
	if (filters.capturedBefore) params.captured_before = filters.capturedBefore;
	return params;
}

export function useQuarantine(filters: QuarantineFilters) {
	const queryKey = useMemo(() => ['mod:quarantine', serializeFilters(filters)], [filters]);
	return useInfiniteQuery<QuarantineResponse>({
		queryKey,
		initialPageParam: null,
		staleTime: 5_000,
		queryFn: async ({ pageParam }) => {
			const res = await modApi.get<QuarantineResponse>('/quarantine', {
				params: {
					...mapFilters(filters),
					after: pageParam ?? undefined,
					limit: PAGE_SIZE,
				},
			});
			return res.data;
		},
		getNextPageParam: (page) => page.next ?? undefined,
	});
}
