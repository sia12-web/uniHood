"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";
import type { RestrictionRecord, RestrictionMode } from "@/hooks/mod/user/use-restrictions";

export type RestrictionCreateRequest = {
	user_id: string;
	scope: string;
	mode: RestrictionMode;
	reason: string;
	ttl_seconds?: number;
};

export type RestrictionCreateResponse = RestrictionRecord;

export function useRestrictionMutations(userId: string | null) {
	const toast = useToast();
	const qc = useQueryClient();

	const create = useMutation<RestrictionCreateResponse, unknown, RestrictionCreateRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<RestrictionCreateResponse>("/restrictions", payload);
			return res.data;
		},
		onSuccess: (data, variables) => {
			qc.invalidateQueries({ queryKey: ["mod:restr", variables.user_id] });
			qc.invalidateQueries({ queryKey: ["mod:rep", variables.user_id] });
			emitSafetyMetric({ event: "rep_restriction_created", mode: variables.mode, scope: variables.scope });
			toast.push({
				id: "restriction-create-success",
				title: "Restriction applied",
				description: `${variables.mode} applied to ${variables.scope}`,
				variant: "success",
			});
		},
		onError: (error, variables) => {
			const description = error instanceof Error ? error.message : "Unable to apply restriction";
			toast.push({
				id: "restriction-create-error",
				title: "Restriction failed",
				description,
				variant: "error",
			});
			console.error("Failed to create restriction", variables, error);
		},
	});

	const revoke = useMutation<void, unknown, { restrictionId: string; scope: string; mode: RestrictionMode }>({
		mutationFn: async ({ restrictionId }) => {
			await modApi.delete(`/restrictions/${restrictionId}`);
		},
		onSuccess: (_, variables) => {
			if (userId) {
				qc.invalidateQueries({ queryKey: ["mod:restr", userId] });
				qc.invalidateQueries({ queryKey: ["mod:rep", userId] });
			}
			emitSafetyMetric({ event: "rep_restriction_revoked", restrictionId: variables.restrictionId });
			toast.push({
				id: "restriction-revoke-success",
				title: "Restriction revoked",
				description: `${variables.mode} lifted for ${variables.scope}`,
				variant: "success",
			});
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to revoke restriction";
			toast.push({
				id: "restriction-revoke-error",
				title: "Revoke failed",
				description,
				variant: "error",
			});
		},
	});

	return { create, revoke };
}
