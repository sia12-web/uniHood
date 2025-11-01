"use client";

import { useMemo, useState } from "react";

import { inferReputationBand, type ReputationBand, type ReputationThreshold, useAdjustReputation } from "@/hooks/mod/use-reputation";

export type AdjustScoreProps = {
	userId: string;
	currentScore: number;
	currentBand: ReputationBand;
	thresholds?: ReputationThreshold[];
	enabled?: boolean;
};

export function AdjustScore({ userId, currentScore, currentBand, thresholds, enabled = true }: AdjustScoreProps) {
	const [delta, setDelta] = useState<number>(0);
	const [note, setNote] = useState("");
	const mutation = useAdjustReputation(userId);

	const preview = useMemo(() => {
		const nextScore = currentScore + delta;
		return {
			score: nextScore,
			band: inferReputationBand(nextScore, thresholds),
		};
	}, [currentScore, delta, thresholds]);

	const neutral = delta === 0;
	const busy = mutation.isPending;
	const disabled = !enabled || neutral || busy;

	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h3 className="text-base font-semibold text-slate-900">Adjust reputation</h3>
					<p className="text-sm text-slate-500">Apply manual adjustments for escalations or overrides.</p>
				</div>
				<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Admin only</span>
			</div>
			<form
				className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
				onSubmit={(event) => {
					event.preventDefault();
					if (disabled) {
						return;
					}
					mutation.mutate({ delta, note: note.trim() || undefined });
				}}
			>
				<label className="flex flex-col gap-2">
					<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delta</span>
					<input
						type="number"
						value={delta}
						step={1}
						onChange={(event) => setDelta(Number(event.target.value))}
						className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
						aria-describedby="adjust-preview"
						required
					/>
				</label>
				<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm" id="adjust-preview">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
					<p className="text-slate-700">
						{currentScore}
						<span className="text-xs text-slate-500"> ({currentBand.toUpperCase()})</span>
						<span className="mx-2 text-xs text-slate-400">→</span>
						<strong className="text-slate-900">{preview.score}</strong>
						<span className="text-xs text-slate-500"> ({preview.band.toUpperCase()})</span>
					</p>
				</div>
				<label className="md:col-span-2">
					<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</span>
					<textarea
						value={note}
						onChange={(event) => setNote(event.target.value)}
						placeholder="Explain why this adjustment is required"
						className="mt-2 h-28 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
					/>
				</label>
				<div className="flex items-center gap-3 md:col-span-2">
					<button
						type="submit"
						className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
						disabled={disabled}
					>
						{busy ? "Applying…" : "Apply adjustment"}
					</button>
					{mutation.isError ? (
						<p className="text-sm text-rose-600">Unable to apply adjustment. Try again.</p>
					) : null}
				</div>
			</form>
		</section>
	);
}
