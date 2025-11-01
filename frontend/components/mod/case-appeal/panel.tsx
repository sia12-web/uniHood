"use client";

import type { CaseAppeal } from "@/hooks/mod/use-case";
import { RevertorPreview } from "@/components/mod/case-appeal/revertor-preview";

const STATUS_BADGES: Record<string, string> = {
	pending: "bg-amber-100 text-amber-700 border border-amber-200",
	accepted: "bg-emerald-100 text-emerald-700 border border-emerald-200",
	rejected: "bg-rose-100 text-rose-700 border border-rose-200",
};

export type AppealResolutionPanelProps = {
	appeal?: CaseAppeal | null;
	canResolve: boolean;
	onResolveClick: () => void;
	suggestedActions?: string[];
};

export function AppealResolutionPanel({ appeal, canResolve, onResolveClick, suggestedActions }: AppealResolutionPanelProps) {
	if (!appeal) {
		return (
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-semibold text-slate-900">Appeal</h2>
				<p className="mt-2 text-sm text-slate-500">No appeal is associated with this case.</p>
			</section>
		);
	}

	const badge = STATUS_BADGES[appeal.status] ?? "bg-slate-100 text-slate-600 border border-slate-200";

	return (
		<section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold text-slate-900">Appeal</h2>
					<p className="text-sm text-slate-500">Review the appellant note and resolve the case.</p>
				</div>
				<span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>{appeal.status.toUpperCase()}</span>
			</header>
			<div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Appeal note</p>
				<p className="text-sm text-slate-700 whitespace-pre-wrap">{appeal.note ?? "No note supplied."}</p>
			</div>
			<div className="grid gap-3 text-sm text-slate-500 sm:grid-cols-2">
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last update</p>
					<p>{new Date(appeal.updated_at).toLocaleString()}</p>
				</div>
				{appeal.resolved_by ? (
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resolved by</p>
						<p>{appeal.resolved_by}</p>
					</div>
				) : null}
			</div>
			<RevertorPreview revertors={suggestedActions} variant="highlight" />
			{canResolve ? (
				<button
					type="button"
					onClick={onResolveClick}
					className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
				>
					Resolve appeal
				</button>
			) : null}
		</section>
	);
}
