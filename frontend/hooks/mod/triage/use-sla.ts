"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";

export type SlaTargetMap = Record<string, number>; // minutes by severity key e.g. "sev4"

export type SlaResponse = {
	sla?: SlaTargetMap;
};

const FALLBACK_TARGETS: SlaTargetMap = {
	sev1: 240,
	sev2: 180,
	sev3: 60,
	sev4: 15,
	sev5: 5,
};

export type SlaState = {
	severity: number;
	targetMinutes: number;
	elapsedMinutes: number;
	ratio: number;
	badge: "ok" | "warning" | "breach";
	remainingText: string;
};

function formatRemaining(remainingMs: number): string {
	if (Number.isNaN(remainingMs)) return "--";
	const sign = remainingMs < 0 ? "-" : "";
	const absolute = Math.abs(remainingMs);
	const minutes = Math.floor(absolute / 60_000);
	const seconds = Math.floor((absolute % 60_000) / 1000);
	return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useSlaTargets() {
	const query = useQuery<SlaResponse>({
		queryKey: ["mod:triage:sla"],
		staleTime: 5 * 60_000,
		queryFn: async () => {
			const response = await modApi.get<SlaResponse>("/admin/dashboard/kpis");
			return response.data;
		},
		retry: 1,
	});

	const targets = query.data?.sla && Object.keys(query.data.sla).length ? query.data.sla : FALLBACK_TARGETS;

	const getState = useMemo(() => {
		return ({ severity, createdAt, slaDueAt }: { severity: number; createdAt: string; slaDueAt?: string | null }): SlaState => {
			const createdTime = new Date(createdAt).getTime();
			const fallbackTarget = FALLBACK_TARGETS[`sev${severity}` as keyof typeof FALLBACK_TARGETS] ?? 60;
			const configuredTarget = targets[`sev${severity}`];
			const targetMinutes = configuredTarget ?? fallbackTarget;
			const dueTime = slaDueAt ? new Date(slaDueAt).getTime() : createdTime + targetMinutes * 60_000;
			const now = Date.now();
			const elapsedMinutes = (now - createdTime) / 60_000;
			const ratio = targetMinutes > 0 ? elapsedMinutes / targetMinutes : 0;
			const badge: "ok" | "warning" | "breach" = ratio < 0.5 ? "ok" : ratio <= 1 ? "warning" : "breach";
			const remainingText = formatRemaining(dueTime - now);
			return {
				severity,
				targetMinutes,
				elapsedMinutes,
				ratio,
				badge,
				remainingText,
			};
		};
	}, [targets]);

	return { targets, getState, isLoading: query.isLoading, isError: query.isError };
}
