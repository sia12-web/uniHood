"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";

export type ResolveAppealRequest = {
	appeal_id: string;
	status: "accepted" | "rejected";
	note?: string;
};

export type ResolveAppealResponse = {
	status: "accepted" | "rejected";
	updated_at: string;
	resolved_by?: string | null;
};

export function useResolveAppeal(caseId: string | null) {
	const toast = useToast();
	const qc = useQueryClient();

	return useMutation<ResolveAppealResponse, unknown, ResolveAppealRequest>({
		mutationFn: async ({ appeal_id, status, note }) => {
			const res = await modApi.post<ResolveAppealResponse>(`/appeals/${appeal_id}/resolve`, { status, note });
			return res.data;
		},
		onSuccess: (data, variables) => {
			if (caseId) {
				qc.invalidateQueries({ queryKey: ["mod:case", caseId] });
			}
			emitSafetyMetric({ event: "appeal_resolve", status: variables.status, caseId: caseId ?? variables.appeal_id });
			toast.push({
				id: "appeal-resolve-success",
				title: `Appeal ${variables.status}`,
				description: `Updated ${data.updated_at}`,
				variant: "success",
			});
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to resolve appeal";
			toast.push({
				id: "appeal-resolve-error",
				title: "Appeal action failed",
				description,
				variant: "error",
			});
		},
	});
}
