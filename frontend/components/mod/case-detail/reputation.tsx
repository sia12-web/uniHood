"use client";

import type { ReputationEvent, ReputationSummary } from "@/hooks/mod/use-reputation";
import type { RestrictionRecord } from "@/hooks/mod/user/use-restrictions";

export type CaseReputationProps = {
	reputation?: ReputationSummary | null;
	restrictions?: RestrictionRecord[];
	onAddRestriction?: () => void;
};

export function CaseReputationPanel({ reputation, restrictions, onAddRestriction }: CaseReputationProps) {
	const events: ReputationEvent[] = reputation?.events_preview ?? [];
	return (
		<div className="space-y-4">
			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Score</p>
				{reputation ? (
					<div className="mt-2 flex items-baseline gap-3">
						<span className="text-3xl font-semibold text-slate-900">{reputation.score}</span>
						<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{reputation.risk_band}</span>
					</div>
				) : (
					<p className="mt-2 text-sm text-slate-500">No reputation data yet.</p>
				)}
			</section>
			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="flex items-center justify-between">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active restrictions</p>
					<button
						type="button"
						onClick={() => onAddRestriction?.()}
						className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
					>
						Add restriction
					</button>
				</div>
				{restrictions?.length ? (
					<ul className="mt-3 space-y-2">
						{restrictions.map((restriction) => (
							<li key={restriction.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
								<div className="flex items-center justify-between">
									<span>{restriction.mode}</span>
									<span className="text-xs text-slate-500">{restriction.scope ?? "global"}</span>
								</div>
								{restriction.expires_at && <p className="text-xs text-slate-500">Expires {new Date(restriction.expires_at).toLocaleString()}</p>}
								{restriction.reason && <p className="text-xs text-slate-500">{restriction.reason}</p>}
							</li>
						))}
					</ul>
				) : (
					<p className="mt-3 text-sm text-slate-500">No restrictions are in effect.</p>
				)}
			</section>
			{events.length ? (
				<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent events</p>
					<ul className="mt-3 space-y-2 text-sm text-slate-700">
						{events.slice(0, 10).map((entry) => (
							<li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
								<div className="flex items-center justify-between">
									<span>{entry.summary ?? entry.kind}</span>
									<span className="text-xs text-slate-500">{new Date(entry.occurred_at).toLocaleString()}</span>
								</div>
								<span className={`text-xs font-semibold ${entry.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
									{entry.delta >= 0 ? '+' : ''}
									{entry.delta}
								</span>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}
