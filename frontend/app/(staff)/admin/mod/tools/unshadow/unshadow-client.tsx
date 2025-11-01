"use client";

import { useCallback } from "react";

import { UnshadowForm } from "@/components/mod/tools/unshadow-form";
import { useBatchUnshadow } from "@/hooks/mod/tools/use-unshadow";

export function UnshadowClient() {
	const { preview, execute, plan, request, canExecute, expiresInMs, missingCampus } = useBatchUnshadow();

	const handlePreview = useCallback(
		async (payload: Parameters<typeof preview.mutateAsync>[0]) => {
			try {
				await preview.mutateAsync(payload);
			} catch {
				// Toast already emitted inside hook; suppress error propagation.
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
				<h1 className="text-2xl font-semibold text-slate-900">Batch unshadow</h1>
				<p className="text-sm text-slate-600">Preview matching content, then confirm execution with the dry-run token.</p>
			</header>

			<UnshadowForm
				onPreview={handlePreview}
				onExecute={handleExecute}
				previewPending={preview.isPending}
				executePending={execute.isPending}
				plan={plan}
				lastRequest={request}
				canExecute={canExecute}
				expiresInMs={expiresInMs}
				missingCampus={missingCampus}
			/>
		</div>
	);
}
