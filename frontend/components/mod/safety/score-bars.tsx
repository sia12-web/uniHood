"use client";

import type { SafetySignalScores } from '@/hooks/mod/safety/use-quarantine-item';

export type ScoreBarsProps = {
	scores?: SafetySignalScores | null;
	title?: string;
};

function normalizeScore(raw: number) {
	if (!Number.isFinite(raw)) return 0;
	if (raw >= 1) return Math.max(0, Math.min(raw, 100));
	return Math.max(0, Math.min(raw * 100, 100));
}

export function ScoreBars({ scores, title }: ScoreBarsProps) {
	if (!scores || Object.keys(scores).length === 0) {
		return (
			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<header className="mb-2 flex items-center justify-between">
					<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title ?? 'Signals'}</h3>
				</header>
				<p className="text-sm text-slate-500">No signals recorded for this item.</p>
			</section>
		);
	}

	const entries = Object.entries(scores).filter(([, value]) => typeof value === 'number');

	return (
		<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<header className="mb-3 flex items-center justify-between">
				<h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title ?? 'Signals'}</h3>
				<span className="text-xs text-slate-400">Higher values indicate stronger confidence</span>
			</header>
			<div className="space-y-3">
				{entries.map(([metric, value]) => {
					const pct = normalizeScore(value as number);
					return (
						<div key={metric} className="space-y-1">
							<div className="flex items-center justify-between text-xs font-semibold text-slate-600">
								<span className="uppercase tracking-wide">{metric}</span>
								<span>{(value as number).toFixed(3)}</span>
							</div>
							<progress
								className="block h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-gradient-to-r [&::-webkit-progress-value]:from-indigo-500 [&::-webkit-progress-value]:via-fuchsia-500 [&::-webkit-progress-value]:to-rose-500"
								value={pct}
								max={100}
								aria-label={`${metric} score ${pct}%`}
							/>
						</div>
					);
				})}
			</div>
		</section>
	);
}
