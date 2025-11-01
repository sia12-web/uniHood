"use client";

import { useQuery } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import type { ReputationEvent } from "@/hooks/mod/user/use-reputation";

export type ReputationEventsResponse = {
	items: ReputationEvent[];
	total: number;
	page: number;
	page_size: number;
};

export function useReputationEvents(userId: string | null, page: number, pageSize: number) {
	return useQuery<ReputationEventsResponse>({
		queryKey: ["mod:rep:events", userId, page, pageSize],
		enabled: Boolean(userId),
		staleTime: 5_000,
		queryFn: async () => {
			const res = await modApi.get<ReputationEventsResponse>(`/reputation/${userId}/events`, {
				params: { page, page_size: pageSize },
			});
			return res.data;
		},
	});
}
