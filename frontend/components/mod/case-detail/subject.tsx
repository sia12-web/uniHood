import type { CaseDetail } from "@/hooks/mod/use-case";

export type CaseSubjectProps = {
	caseItem: CaseDetail;
};

export function CaseSubject({ caseItem }: CaseSubjectProps) {
	return (
		<div className="space-y-3">
			<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</p>
				<p className="mt-1 text-sm text-slate-700">
					{caseItem.subject_type} · {caseItem.subject_id}
				</p>
			</div>
			<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-inner">
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
				<p className="mt-2 whitespace-pre-line text-sm text-slate-700">
					{/* Placeholder preview until the actual content fetch hooks are wired. */}
					{caseItem.reason || 'No subject preview available yet.'}
				</p>
			</div>
		</div>
	);
}
