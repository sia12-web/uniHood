"use client";

import { CasesBulkActions } from "@/components/mod/cases/bulk-actions";
import type { CaseBulkActionRequest } from "@/hooks/mod/use-cases";

export type CasesActionsBarProps = {
	selectedIds: string[];
	onClear: () => void;
	onBulkAction: (payload: CaseBulkActionRequest) => void;
	isSubmitting?: boolean;
};

export function CasesActionsBar({ selectedIds, onClear, onBulkAction, isSubmitting }: CasesActionsBarProps) {
	const selectedCount = selectedIds.length;

	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
			<div className="flex items-center gap-3 text-sm text-slate-600">
				<span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">{selectedCount}</span>
				<span>{selectedCount === 1 ? "case selected" : "cases selected"}</span>
				<button
					type="button"
					onClick={onClear}
					className="text-xs font-semibold uppercase tracking-wide text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
					disabled={selectedCount === 0}
				>
					Clear
				</button>
			</div>
			<CasesBulkActions selectedIds={selectedIds} onSubmit={onBulkAction} disabled={isSubmitting} />
		</section>
	);
}
