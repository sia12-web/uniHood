"use client";

import { useCallback } from "react";

import { MacroForm } from "@/components/mod/tools/macro-form";
import { PlanPreview } from "@/components/mod/tools/plan-preview";
import { useMacroTools } from "@/hooks/mod/tools/use-macro";

export function MacrosClient() {
	const { plan, request, simulate, execute, reset, canExecute, expiresInMs } = useMacroTools();

	const handleSimulate = useCallback(
		async (payload: Parameters<typeof simulate.mutateAsync>[0]) => {
			try {
				await simulate.mutateAsync(payload);
			} catch {
				// Toast already emitted inside hook; suppress error for form.
			}
		},
		[simulate],
	);

	const handleExecute = useCallback(
		async (payload: Parameters<typeof execute.mutateAsync>[0]) => {
			try {
				await execute.mutateAsync(payload);
			} catch {
				// Toast already emitted inside hook; suppress error for form.
			}
		},
		[execute],
	);

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold text-slate-900">Macro runner</h1>
				<p className="text-sm text-slate-600">Create a simulation, inspect the plan sample, then confirm execution.</p>
			</header>

			<MacroForm
				simulatePending={simulate.isPending}
				executePending={execute.isPending}
				onSimulate={handleSimulate}
				onExecute={handleExecute}
				plan={plan}
				lastRequest={request}
				canExecute={canExecute}
				expiresInMs={expiresInMs}
			/>

			<PlanPreview plan={plan} onClear={reset} />
		</div>
	);
}
