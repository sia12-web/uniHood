"use client";

import { useQuery } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";

export type CannedMacroRecord = {
	key: string;
	version: number;
	description?: string | null;
	summary?: string | null;
	metadata?: Record<string, unknown> | null;
};

export type CannedMacroListResponse = {
	items: CannedMacroRecord[];
};

export function useCannedActions() {
	return useQuery<CannedMacroListResponse>({
		queryKey: ["mod:triage:canned"],
		staleTime: 60_000,
		queryFn: async () => {
			const response = await modApi.get<CannedMacroListResponse>("/tools/actions", {
				params: { kind: "macro", active: 1, tag: "triage" },
			});
			return response.data;
		},
	});
}
