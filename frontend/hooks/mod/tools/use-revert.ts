"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";

export type RevertActionKind = "remove" | "ban" | "mute" | "restrict_create" | "shadow_hide";

export type RevertSelector =
	| { kind: "cases"; ids: string[] }
	| { kind: "subjects"; subject_type: string; ids: string[] }
	| { kind: "query"; subject_type: string; filter: Record<string, unknown> };

export type RevertPreviewRequest = {
	actions: RevertActionKind[];
	selector: RevertSelector;
	reason_note?: string;
	sample_size?: number;
};

export type RevertPreviewItem = {
	target_id: string;
	action: RevertActionKind;
	performed_at?: string | null;
	performed_by?: string | null;
};

export type RevertPreviewResponse = {
	token: string;
	total: number;
	sample: RevertPreviewItem[];
	expires_at: string;
};

export type RevertExecuteRequest = RevertPreviewRequest & {
	token?: string;
	dry_run?: boolean;
};

export type RevertExecuteResponse = {
	job_id: string;
	dry_run: boolean;
	submitted_at: string;
};

const PREVIEW_TTL_MS = 15 * 60 * 1000;

export function useBatchRevert() {
	const toast = useToast();
	const qc = useQueryClient();
	const [state, setState] = useState<{ request: RevertPreviewRequest; preview: RevertPreviewResponse; receivedAt: number } | null>(null);

	const preview = useMutation<RevertPreviewResponse, unknown, RevertPreviewRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<RevertPreviewResponse>("/tools/simulate/batch_revert", payload);
			return res.data;
		},
		onSuccess: (data, variables) => {
			setState({ request: variables, preview: data, receivedAt: Date.now() });
			toast.push({
				id: "revert-preview-success",
				title: "Preview ready",
				description: `${data.total} actions to revert`,
				variant: "success",
			});
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to preview revert job";
			toast.push({ id: "revert-preview-error", title: "Preview failed", description, variant: "error" });
		},
	});

	const execute = useMutation<RevertExecuteResponse, unknown, RevertExecuteRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<RevertExecuteResponse>("/tools/run/batch_revert", {
				...payload,
				dry_run: false,
			});
			return res.data;
		},
		onSuccess: (data, variables) => {
			qc.invalidateQueries({ queryKey: ["tools:jobs"] });
			emitSafetyMetric({ event: "ui_tools_revert_execute_total", actions: variables.actions });
			toast.push({ id: "revert-run-success", title: "Revert queued", description: `Job ${data.job_id} created`, variant: "success" });
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to run revert job";
			toast.push({ id: "revert-run-error", title: "Execution failed", description, variant: "error" });
		},
	});

	const reset = useMemo(() => () => setState(null), []);

	const canExecute = state ? Date.now() - state.receivedAt < PREVIEW_TTL_MS : false;
	const expiresInMs = state ? PREVIEW_TTL_MS - (Date.now() - state.receivedAt) : null;

	return {
		preview,
		execute,
		reset,
		plan: state?.preview ?? null,
		request: state?.request ?? null,
		receivedAt: state?.receivedAt ?? null,
		canExecute,
		expiresInMs,
	};
}
