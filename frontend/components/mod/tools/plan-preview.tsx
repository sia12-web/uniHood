"use client";

import type { MacroPlanResponse } from "@/hooks/mod/tools/use-macro";

export type PlanPreviewProps = {
	plan: MacroPlanResponse | null;
	onClear?: () => void;
};

export function PlanPreview({ plan, onClear }: PlanPreviewProps) {
	if (!plan) {
		return null;
	}

	return (
		<section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 className="text-lg font-semibold text-slate-900">Simulation plan</h3>
					<p className="text-sm text-slate-600">Target sample limited to first 200 items for review.</p>
				</div>
				<div className="flex items-center gap-3 text-sm text-slate-600">
					<span>Total targets: <strong>{plan.total_targets}</strong></span>
					{onClear ? (
						<button
							type="button"
							onClick={onClear}
							className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
						>
							Clear plan
						</button>
					) : null}
				</div>
			</header>
			<ul className="space-y-3">
				{plan.sample.map((item) => (
					<li key={item.target} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<p className="font-mono text-xs text-slate-500">{item.target}</p>
						<ul className="mt-3 space-y-2 text-sm text-slate-700">
							{item.steps.map((step, index) => (
								<li key={`${item.target}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
									<p className="font-semibold">{step.use}</p>
									{step.vars ? (
										<pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-600">{JSON.stringify(step.vars, null, 2)}</pre>
									) : null}
									{step.when ? (
										<pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-500">{JSON.stringify(step.when, null, 2)}</pre>
									) : null}
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</section>
	);
}
