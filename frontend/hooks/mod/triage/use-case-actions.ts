"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";

export type CaseActionType = "assign" | "escalate" | "dismiss" | "apply_enforcement" | "tombstone" | "remove" | "macro";

export type CaseActionRequest = {
	caseId: string;
	type: CaseActionType;
	payload?: Record<string, unknown>;
};

export function useCaseActions() {
	const qc = useQueryClient();
	const toast = useToast();

	return useMutation<void, unknown, CaseActionRequest>({
		mutationFn: async ({ caseId, type, payload }) => {
			const action = type === "tombstone" || type === "remove" ? "apply_enforcement" : type;
			await modApi.post("/admin/cases/batch_action", {
				case_ids: [caseId],
				action,
				payload: payload ?? (type === "tombstone" ? { decision: "tombstone" } : type === "remove" ? { decision: "remove" } : payload),
			});
		},
		onSuccess: (_, variables) => {
			qc.invalidateQueries({ queryKey: ["mod:triage:queue"] });
			qc.invalidateQueries({ queryKey: ["mod:case", variables.caseId] });
			emitSafetyMetric({ event: "ui_triage_action_total", action: variables.type });
			toast.push({
				id: `triage-${variables.caseId}-${variables.type}`,
				title: "Action queued",
				description: `${variables.type} sent for case ${variables.caseId}`,
				variant: "success",
			});
		},
		onError: (error, variables) => {
			const description = error instanceof Error ? error.message : "Unable to run action";
			toast.push({
				id: `triage-${variables.caseId}-${variables.type}-error`,
				title: "Action failed",
				description,
				variant: "error",
			});
		},
	});
}
