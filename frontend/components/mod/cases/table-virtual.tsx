"use client";

import type { ModerationCase } from "@/hooks/mod/use-cases";

import { CaseRow } from "./row";

export type CasesTableVirtualProps = {
	cases: ModerationCase[];
	selectedIds: Record<string, boolean>;
	onToggleSelect: (caseId: string) => void;
	onSelectAll: (selected: boolean) => void;
	fetching?: boolean;
};

export function CasesTableVirtual({ cases, selectedIds, onToggleSelect, onSelectAll, fetching }: CasesTableVirtualProps) {
	const allSelected = cases.length > 0 && cases.every((item) => selectedIds[item.id]);

	return (
		<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			<table role="table" className="min-w-full divide-y divide-slate-200">
				<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
					<tr>
						<th scope="col" className="px-3 py-2">
							<input
								type="checkbox"
								aria-label="Select all cases"
								checked={allSelected}
								onChange={(event) => onSelectAll(event.target.checked)}
								className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
							/>
						</th>
						<th scope="col" className="px-3 py-2 text-left">Case ID</th>
						<th scope="col" className="px-3 py-2 text-left">Severity</th>
						<th scope="col" className="px-3 py-2 text-left">Status</th>
						<th scope="col" className="px-3 py-2 text-left">Subject</th>
						<th scope="col" className="px-3 py-2 text-left">Reason</th>
						<th scope="col" className="px-3 py-2 text-left">Assigned</th>
						<th scope="col" className="px-3 py-2 text-left">Updated</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-200">
					{cases.length === 0 ? (
						<tr>
							<td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">
								{fetching ? 'Loading cases…' : 'No cases match the current filters.'}
							</td>
						</tr>
					) : (
						cases.map((caseItem) => (
							<CaseRow
								key={caseItem.id}
								caseItem={caseItem}
								selected={Boolean(selectedIds[caseItem.id])}
								onToggle={onToggleSelect}
							/>
						))
					)}
				</tbody>
			</table>
		</section>
	);
}
