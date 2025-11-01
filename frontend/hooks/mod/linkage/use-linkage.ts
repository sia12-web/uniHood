"use client";

import { useQuery } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";

export type LinkageRelation = "shared_device" | "shared_ip_24h" | "shared_cookie" | string;

export type LinkageNode = {
	user_id: string;
	display_name?: string | null;
	risk_band?: string | null;
	role?: "user" | "moderator" | "admin" | string | null;
	campus?: string | null;
	last_seen_at?: string | null;
};

export type LinkageEdge = {
	relation: LinkageRelation;
	strength: number;
	target: string;
	meta?: Record<string, unknown> | null;
};

export type LinkageResponse = {
	user: LinkageNode;
	peers: Array<LinkageNode & { relations: LinkageEdge[] }>;
	generated_at: string;
};

export type LinkageFilters = {
	relation?: LinkageRelation | "all";
	minStrength?: number;
	campus?: string | "all";
};

export function useLinkage(userId: string | null, filters: LinkageFilters) {
	return useQuery<LinkageResponse>({
		queryKey: ["mod:linkage", userId, filters],
		enabled: Boolean(userId),
		staleTime: 30_000,
		queryFn: async () => {
			const res = await modApi.get<LinkageResponse>(`/linkage/${userId}`, {
				params: {
					relation: filters.relation && filters.relation !== "all" ? filters.relation : undefined,
					min_strength: filters.minStrength,
					campus: filters.campus && filters.campus !== "all" ? filters.campus : undefined,
				},
			});
			return res.data;
		},
	});
}
