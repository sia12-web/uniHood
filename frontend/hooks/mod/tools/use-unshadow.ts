"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";

export type UnshadowQueryFilter = {
	subject_type: "post" | "comment";
	campus?: string | null;
	actor_id?: string | null;
	created_after?: string | null;
	created_before?: string | null;
	shadow_only?: boolean;
};

export type UnshadowPreviewRequest = {
	filter: UnshadowQueryFilter;
	sample_size?: number;
	reason_note?: string;
};

export type UnshadowPreviewItem = {
	target_id: string;
	campus?: string | null;
	shadow_reason?: string | null;
	acted_at?: string | null;
};

export type UnshadowPreviewResponse = {
	token: string;
	total: number;
	sample: UnshadowPreviewItem[];
	expires_at: string;
};

export type UnshadowExecuteRequest = UnshadowPreviewRequest & {
	token?: string;
	dry_run?: boolean;
};

export type UnshadowExecuteResponse = {
	job_id: string;
	dry_run: boolean;
	submitted_at: string;
};

const PREVIEW_TTL_MS = 15 * 60 * 1000;

export function useBatchUnshadow() {
	const toast = useToast();
	const qc = useQueryClient();
	const [state, setState] = useState<{ request: UnshadowPreviewRequest; preview: UnshadowPreviewResponse; receivedAt: number } | null>(null);

	const preview = useMutation<UnshadowPreviewResponse, unknown, UnshadowPreviewRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<UnshadowPreviewResponse>("/tools/simulate/batch_unshadow", payload);
			return res.data;
		},
		onSuccess: (data, variables) => {
			setState({ request: variables, preview: data, receivedAt: Date.now() });
			toast.push({
				id: "unshadow-preview-success",
				title: "Preview ready",
				description: `${data.total} items match filters`,
				variant: "success",
			});
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to preview unshadow run";
			toast.push({ id: "unshadow-preview-error", title: "Preview failed", description, variant: "error" });
		},
	});

	const execute = useMutation<UnshadowExecuteResponse, unknown, UnshadowExecuteRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<UnshadowExecuteResponse>("/tools/run/batch_unshadow", {
				...payload,
				dry_run: false,
			});
			return res.data;
		},
		onSuccess: (data) => {
			qc.invalidateQueries({ queryKey: ["tools:jobs"] });
			emitSafetyMetric({ event: "ui_tools_unshadow_execute_total" });
			toast.push({ id: "unshadow-run-success", title: "Batch queued", description: `Job ${data.job_id} created`, variant: "success" });
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to run unshadow batch";
			toast.push({ id: "unshadow-run-error", title: "Execution failed", description, variant: "error" });
		},
	});

	const reset = useMemo(() => () => setState(null), []);

	const canExecute = state ? Date.now() - state.receivedAt < PREVIEW_TTL_MS : false;
	const expiresInMs = state ? PREVIEW_TTL_MS - (Date.now() - state.receivedAt) : null;
	const missingCampus = state?.request.filter.campus == null || state?.request.filter.campus === "";

	return {
		preview,
		execute,
		reset,
		plan: state?.preview ?? null,
		request: state?.request ?? null,
		receivedAt: state?.receivedAt ?? null,
		canExecute,
		expiresInMs,
		missingCampus,
	};
}
