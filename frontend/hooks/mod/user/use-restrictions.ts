"use client";

import { useQuery } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";

export type RestrictionMode = "cooldown" | "shadow_restrict" | "captcha" | "hard_block" | "suspension" | string;

export type RestrictionRecord = {
	id: string;
	user_id: string;
	scope: string;
	mode: RestrictionMode;
	reason?: string | null;
	expires_at?: string | null;
	created_at: string;
	created_by?: string | null;
	meta?: Record<string, unknown> | null;
	status?: "active" | "expired";
};

export type RestrictionsResponse = {
	items: RestrictionRecord[];
	total: number;
};

export function useRestrictions(userId: string | null, activeOnly = true) {
	return useQuery<RestrictionsResponse>({
		queryKey: ["mod:restr", userId, activeOnly],
		enabled: Boolean(userId),
		staleTime: 5_000,
		queryFn: async () => {
			const res = await modApi.get<RestrictionsResponse>("/restrictions", {
				params: { user_id: userId, active_only: activeOnly ? 1 : 0 },
			});
			return res.data;
		},
	});
}
