"use client";

import { useCallback, useMemo } from "react";

import type { CaseSummary } from "@/hooks/mod/triage/use-queue";
import type { SlaState } from "@/hooks/mod/triage/use-sla";
import { useSlaTargets } from "@/hooks/mod/triage/use-sla";

import { QueueRow } from "./row";

export type QueueTableProps = {
	cases: CaseSummary[];
	selectedIds: Record<string, boolean>;
	activeCaseId?: string | null;
	onToggleSelect: (caseId: string) => void;
	onSelectAll?: (select: boolean) => void;
	onOpenCase: (caseItem: CaseSummary) => void;
	isLoading?: boolean;
	hasNextPage?: boolean;
	onLoadMore?: () => void;
	isFetchingMore?: boolean;
};

export function QueueTable({
	cases,
	selectedIds,
	activeCaseId,
	onToggleSelect,
	onSelectAll,
	onOpenCase,
	isLoading,
	hasNextPage,
	onLoadMore,
	isFetchingMore,
}: QueueTableProps) {
	const { getState } = useSlaTargets();

	const allSelected = useMemo(() => cases.length > 0 && cases.every((item) => selectedIds[item.id]), [cases, selectedIds]);

	const buildSlaState = useCallback(
		(caseItem: CaseSummary): (() => SlaState) =>
			() =>
				getState({
					severity: caseItem.severity,
					createdAt: caseItem.created_at,
					slaDueAt: caseItem.sla_due_at ?? null,
				}),
		[getState],
	);

	return (
		<section className="flex flex-col gap-4">
			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<table role="table" className="min-w-full divide-y divide-slate-200">
					<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
						<tr>
							<th scope="col" className="px-3 py-3 text-left">
								<input
									type="checkbox"
									checked={allSelected}
									onChange={(event) => onSelectAll?.(event.target.checked)}
									aria-label="Select all cases"
									className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
								/>
							</th>
							<th scope="col" className="px-3 py-3 text-left">Case</th>
							<th scope="col" className="px-3 py-3 text-left">Severity</th>
							<th scope="col" className="px-3 py-3 text-left">Status</th>
							<th scope="col" className="px-3 py-3 text-left">Subject</th>
							<th scope="col" className="px-3 py-3 text-left">Assignment</th>
							<th scope="col" className="px-3 py-3 text-left">SLA</th>
							<th scope="col" className="px-3 py-3 text-left">Updated</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-200">
						{cases.length === 0 ? (
							<tr>
								<td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
									{isLoading ? "Loading cases…" : "No cases match the current queue."}
								</td>
							</tr>
						) : (
							cases.map((caseItem) => (
								<QueueRow
									key={caseItem.id}
									caseItem={caseItem}
									selected={Boolean(selectedIds[caseItem.id])}
									active={activeCaseId === caseItem.id}
									onToggle={onToggleSelect}
									onOpen={onOpenCase}
									buildSlaState={buildSlaState}
								/>
							))
						)}
					</tbody>
				</table>
			</div>
			{hasNextPage ? (
				<button
					type="button"
					onClick={onLoadMore}
					disabled={Boolean(isFetchingMore)}
					className="self-center rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
				>
					{isFetchingMore ? "Loading…" : "Load more"}
				</button>
			) : null}
		</section>
	);
}
