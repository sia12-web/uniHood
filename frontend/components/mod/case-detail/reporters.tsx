import type { CaseReporter } from "@/hooks/mod/use-case";

export type CaseReportersProps = {
	reporters?: CaseReporter[];
};

export function CaseReporters({ reporters }: CaseReportersProps) {
	if (!reporters?.length) {
		return <p className="text-sm text-slate-500">No reporters associated with this case yet.</p>;
	}

	return (
		<ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
			{reporters.map((reporter) => (
				<li key={reporter.id} className="flex items-center justify-between px-4 py-3 text-sm text-slate-700">
					<div>
						<p className="font-semibold">
							{reporter.is_redacted ? 'Redacted reporter' : reporter.handle ?? reporter.id}
						</p>
						<p className="text-xs text-slate-500">Reports: {reporter.reports}</p>
					</div>
					{reporter.is_redacted && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">PII hidden</span>}
				</li>
			))}
		</ul>
	);
}
