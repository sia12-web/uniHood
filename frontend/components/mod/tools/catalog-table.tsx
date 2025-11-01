"use client";

import { useMemo } from "react";

import type { ToolActionRecord } from "@/hooks/mod/tools/use-catalog";

export type CatalogTableProps = {
	actions: ToolActionRecord[];
	loading?: boolean;
	onInspect?(action: ToolActionRecord): void;
	onDeactivate?(action: ToolActionRecord): void;
};

const KIND_LABEL: Record<string, string> = {
	atomic: "Atomic",
	macro: "Macro",
};

export function CatalogTable({ actions, loading, onInspect, onDeactivate }: CatalogTableProps) {
	const rows = useMemo(() => actions.sort((a, b) => a.key.localeCompare(b.key) || b.version - a.version), [actions]);

	return (
		<div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
			<table className="min-w-full divide-y divide-slate-200">
				<thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
					<tr>
						<th className="px-4 py-3">Key</th>
						<th className="px-4 py-3">Version</th>
						<th className="px-4 py-3">Kind</th>
						<th className="px-4 py-3">Active</th>
						<th className="px-4 py-3">Created by</th>
						<th className="px-4 py-3">Created at</th>
						<th className="px-4 py-3">Actions</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-200 text-sm text-slate-700">
					{rows.map((action) => (
						<tr key={`${action.key}-${action.version}`} className={loading ? "opacity-60" : undefined}>
							<td className="px-4 py-3 font-mono text-xs uppercase">{action.key}</td>
							<td className="px-4 py-3">{action.version}</td>
							<td className="px-4 py-3">
								<span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
									{KIND_LABEL[action.kind] ?? action.kind}
								</span>
							</td>
							<td className="px-4 py-3">
								<span
									className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${action.active ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}
									aria-label={action.active ? "Active" : "Inactive"}
								>
									{action.active ? "Active" : "Inactive"}
								</span>
							</td>
							<td className="px-4 py-3">{action.created_by ?? "—"}</td>
							<td className="px-4 py-3 text-xs text-slate-500">{new Date(action.created_at).toLocaleString()}</td>
							<td className="px-4 py-3">
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300"
										onClick={() => onInspect?.(action)}
									>
										View
									</button>
									<button
										type="button"
										className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
										onClick={() => onDeactivate?.(action)}
										disabled={!action.active}
									>
										Deactivate
									</button>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{!rows.length ? (
				<div className="px-6 py-12 text-center text-sm text-slate-500">No actions found. Create one to get started.</div>
			) : null}
		</div>
	);
}
