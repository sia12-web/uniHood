"use client";

import { useCallback } from "react";

import { RevertForm } from "@/components/mod/tools/revert-form";
import { useBatchRevert } from "@/hooks/mod/tools/use-revert";

export function RevertClient() {
	const { preview, execute, plan, request, canExecute, expiresInMs } = useBatchRevert();

	const handlePreview = useCallback(
		async (payload: Parameters<typeof preview.mutateAsync>[0]) => {
			try {
				await preview.mutateAsync(payload);
			} catch {
				// Toast already emitted inside hook; suppress bubbling.
			}
		},
		[preview],
	);

	const handleExecute = useCallback(
		async (payload: Parameters<typeof execute.mutateAsync>[0]) => {
			try {
				await execute.mutateAsync(payload);
			} catch {
				// Toast already emitted inside hook.
			}
		},
		[execute],
	);

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold text-slate-900">Batch revert</h1>
				<p className="text-sm text-slate-600">Preview matched actions and confirm before enqueuing the revert job.</p>
			</header>

			<RevertForm
				onPreview={handlePreview}
				onExecute={handleExecute}
				previewPending={preview.isPending}
				executePending={execute.isPending}
				plan={plan}
				lastRequest={request}
				canExecute={canExecute}
				expiresInMs={expiresInMs}
			/>
		</div>
	);
}
