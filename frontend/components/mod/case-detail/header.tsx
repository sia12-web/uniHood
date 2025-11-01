"use client";

import type { CaseActionRequest, CaseDetail } from "@/hooks/mod/use-case";

export type CaseDetailHeaderProps = {
	caseItem: CaseDetail;
	onAction?: (payload: CaseActionRequest) => void;
};

export function CaseDetailHeader({ caseItem, onAction }: CaseDetailHeaderProps) {
	return (
		<header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
			<div className="space-y-2">
				<div className="flex items-center gap-3">
					<span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">Severity {caseItem.severity}</span>
					<span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
						{caseItem.status}
					</span>
					{caseItem.appeal_open && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Appeal open</span>}
				</div>
				<h2 className="text-lg font-semibold text-slate-900">Case {caseItem.id}</h2>
				<p className="text-sm text-slate-600">
					Subject {caseItem.subject_type} · {caseItem.subject_id} · Campus {caseItem.campus_id}
				</p>
				<p className="text-sm text-slate-600">Reason: {caseItem.reason}</p>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={() => onAction?.({ action: 'assign' })}
					className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
				>
					Assign to me
				</button>
				<button
					type="button"
					onClick={() => onAction?.({ action: 'escalate' })}
					className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
				>
					Escalate
				</button>
				<button
					type="button"
					onClick={() => onAction?.({ action: 'dismiss', note: 'Dismissed from header quick action' })}
					className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
				>
					Dismiss
				</button>
				<button
					type="button"
					onClick={() => onAction?.({ action: 'apply_enforcement', payload: { decision: 'tombstone' } })}
					className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
				>
					Apply enforcement
				</button>
			</div>
		</header>
	);
}
