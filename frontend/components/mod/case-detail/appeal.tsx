"use client";

import { useState } from "react";

import type { CaseAppeal } from "@/hooks/mod/use-case";

export type CaseAppealProps = {
	appeal?: CaseAppeal | null;
	onResolve?: (note: string) => void;
	canResolve?: boolean;
};

export function CaseAppealPanel({ appeal, onResolve, canResolve = false }: CaseAppealProps) {
	const [note, setNote] = useState(appeal?.note ?? "");

	if (!appeal) {
		return <p className="text-sm text-slate-500">No appeal has been filed for this case.</p>;
	}

	return (
		<div className="space-y-4">
			<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
				<p className="mt-1 text-sm text-slate-700">
					{appeal.status} — updated {new Date(appeal.updated_at).toLocaleString()}
				</p>
				{appeal.resolved_by && <p className="text-xs text-slate-500">Resolved by {appeal.resolved_by}</p>}
			</div>
			<label className="block space-y-2">
				<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Appeal note</span>
				<textarea
					value={note}
					onChange={(event) => setNote(event.target.value)}
					className="h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
					readOnly={!canResolve}
				/>
			</label>
			{canResolve && (
				<button
					type="button"
					onClick={() => onResolve?.(note)}
					className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
				>
					Resolve appeal
				</button>
			)}
		</div>
	);
}
