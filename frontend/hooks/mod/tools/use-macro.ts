"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { useToast } from "@/hooks/use-toast";

export type MacroSelector =
	| { kind: "cases"; ids: string[] }
	| { kind: "subjects"; subject_type: string; ids: string[] }
	| { kind: "query"; subject_type: "post" | "comment" | "user"; filter: Record<string, unknown> };

export type MacroSimulateRequest = {
	macro: string;
	selector: MacroSelector;
	sample_size?: number;
	reason_note?: string;
	variables?: Record<string, unknown>;
};

export type MacroPlanStep = {
	use: string;
	vars?: Record<string, unknown> | null;
	when?: Record<string, unknown> | null;
};

export type MacroPlanTarget = {
	target: string;
	steps: MacroPlanStep[];
};

export type MacroPlanResponse = {
	plan_id: string;
	total_targets: number;
	sample: MacroPlanTarget[];
	generated_at: string;
	expires_at: string;
	dry_run: boolean;
	selector_warning?: string | null;
};

export type MacroExecuteRequest = MacroSimulateRequest & {
	plan_id?: string;
	dry_run?: boolean;
};

export type MacroExecuteResponse = {
	job_id: string;
	dry_run: boolean;
	submitted_at: string;
};

export type MacroPlanState = {
	plan: MacroPlanResponse;
	receivedAt: number;
	request: MacroSimulateRequest;
};

const PLAN_TTL_MS = 15 * 60 * 1000;

export function useMacroTools() {
	const toast = useToast();
	const qc = useQueryClient();
	const [state, setState] = useState<MacroPlanState | null>(null);

	const simulate = useMutation<MacroPlanResponse, unknown, MacroSimulateRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<MacroPlanResponse>("/tools/simulate/macro", {
				...payload,
				dry_run: true,
			});
			return res.data;
		},
		onSuccess: (data, variables) => {
			setState({ plan: data, receivedAt: Date.now(), request: variables });
			emitSafetyMetric({ event: "ui_tools_macro_simulate_total", macro: variables.macro, sample_size: variables.sample_size ?? null });
			toast.push({
				id: "macro-plan-success",
				title: "Simulation ready",
				description: `${data.total_targets} targets queued in plan`,
				variant: "success",
			});
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to simulate macro";
			toast.push({ id: "macro-plan-error", title: "Simulation failed", description, variant: "error" });
		},
	});

	const execute = useMutation<MacroExecuteResponse, unknown, MacroExecuteRequest>({
		mutationFn: async (payload) => {
			const res = await modApi.post<MacroExecuteResponse>("/tools/run/macro", {
				...payload,
				dry_run: false,
			});
			return res.data;
		},
		onSuccess: (data, variables) => {
			qc.invalidateQueries({ queryKey: ["tools:jobs"] });
			if (state) {
				setState({ ...state, plan: { ...state.plan, dry_run: false } });
			}
			emitSafetyMetric({ event: "ui_tools_macro_execute_total", macro: variables.macro, targets: state?.plan.total_targets ?? null });
			toast.push({ id: "macro-run-success", title: "Macro queued", description: `Job ${data.job_id} created`, variant: "success" });
		},
		onError: (error) => {
			const description = error instanceof Error ? error.message : "Unable to execute macro";
			toast.push({ id: "macro-run-error", title: "Execution failed", description, variant: "error" });
		},
	});

	const reset = useMemo(() => () => setState(null), []);

	const canExecute = state ? Date.now() - state.receivedAt < PLAN_TTL_MS : false;
	const expiresInMs = state ? PLAN_TTL_MS - (Date.now() - state.receivedAt) : null;

	return {
		plan: state?.plan ?? null,
		request: state?.request ?? null,
		receivedAt: state?.receivedAt ?? null,
		canExecute,
		expiresInMs,
		simulate,
		execute,
		reset,
	};
}
