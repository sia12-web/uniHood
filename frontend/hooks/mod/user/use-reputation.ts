"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";

export type ReputationBand = "good" | "neutral" | "watch" | "risk" | "bad";

export type ReputationThreshold = {
	band: ReputationBand;
	min_score: number;
	max_score?: number | null;
};

export type ReputationEvent = {
	id: string;
	surface: string;
	kind: string;
	delta: number;
	summary?: string | null;
	occurred_at: string;
	meta?: Record<string, unknown> | null;
};

export type ReputationSummary = {
	user_id: string;
	display_name?: string | null;
	avatar_url?: string | null;
	campus?: string | null;
	verified?: boolean | null;
	joined_at?: string | null;
	score: number;
	risk_band: ReputationBand;
	last_event_at?: string | null;
	total_events: number;
	band_thresholds?: ReputationThreshold[];
	events_preview?: ReputationEvent[];
};

export type ReputationAdjustRequest = {
	delta: number;
	note?: string;
	dry_run?: boolean;
};

export type ReputationAdjustResponse = {
	score: number;
	risk_band: ReputationBand;
};

export function useReputation(userId: string | null) {
	return useQuery<ReputationSummary>({
		queryKey: ["mod:rep", userId],
		enabled: Boolean(userId),
		staleTime: 10_000,
		queryFn: async () => {
			const res = await modApi.get<ReputationSummary>(`/reputation/${userId}`);
			return res.data;
		},
	});
}

export function useAdjustReputation(userId: string | null) {
	const toast = useToast();
	const qc = useQueryClient();

	return useMutation<ReputationAdjustResponse, unknown, ReputationAdjustRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<ReputationAdjustResponse>(`/reputation/${userId}/adjust`, payload);
			return res.data;
		},
		onSuccess: (data, variables) => {
			qc.invalidateQueries({ queryKey: ["mod:rep", userId] });
			qc.invalidateQueries({ queryKey: ["mod:rep:events", userId] });
			emitSafetyMetric({ event: "rep_adjust_score", delta: variables.delta });
			toast.push({
				id: "rep-adjust-success",
				title: "Reputation updated",
				description: `Score adjusted to ${data.score} (${data.risk_band})`,
				variant: "success",
			});
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to adjust reputation";
			toast.push({ id: "rep-adjust-error", title: "Adjustment failed", description, variant: "error" });
		},
	});
}

export function inferReputationBand(score: number, thresholds?: ReputationThreshold[]): ReputationBand {
	if (!thresholds?.length) {
		if (score >= 80) return "good";
		if (score >= 60) return "neutral";
		if (score >= 40) return "watch";
		if (score >= 20) return "risk";
		return "bad";
	}
	const ordered = [...thresholds].sort((a, b) => b.min_score - a.min_score);
	const match = ordered.find((band) => score >= band.min_score && (band.max_score == null || score <= band.max_score));
	return match?.band ?? ordered[ordered.length - 1]?.band ?? "watch";
}
