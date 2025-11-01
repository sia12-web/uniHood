"use client";

import type { ReputationBand } from "@/hooks/mod/user/use-reputation";

const BAND_BADGES: Record<ReputationBand, string> = {
	good: "bg-emerald-100 text-emerald-700 border border-emerald-200",
	neutral: "bg-slate-100 text-slate-700 border border-slate-200",
	watch: "bg-amber-100 text-amber-700 border border-amber-200",
	risk: "bg-orange-100 text-orange-700 border border-orange-200",
	bad: "bg-rose-100 text-rose-700 border border-rose-200",
};

export type ScoreCardProps = {
	score: number;
	riskBand: ReputationBand;
	lastEventAt?: string | null;
	preview?: { score: number; band: ReputationBand } | null;
};

export function ScoreCard({ score, riskBand, lastEventAt, preview }: ScoreCardProps) {
	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reputation score</p>
					<div className="mt-2 flex items-baseline gap-3">
						<span className="text-4xl font-semibold text-slate-900">{score}</span>
						<span className={`rounded-full px-3 py-1 text-xs font-semibold ${BAND_BADGES[riskBand]}`}>{riskBand.toUpperCase()}</span>
					</div>
				</div>
				{preview ? (
					<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
						<p className="font-semibold text-slate-700">Preview</p>
						<p>
							New score <span className="font-semibold text-slate-900">{preview.score}</span> → {preview.band.toUpperCase()}
						</p>
					</div>
				) : null}
			</div>
			{lastEventAt ? (
				<p className="mt-4 text-sm text-slate-500">Last event recorded {new Date(lastEventAt).toLocaleString()}</p>
			) : (
				<p className="mt-4 text-sm text-slate-400">No reputation events yet.</p>
			)}
		</section>
	);
}
