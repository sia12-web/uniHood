"use client";

import { useState } from 'react';

import type { ThresholdSimulateResponse } from '@/hooks/mod/safety/use-thresholds-simulate';

export type ThresholdsSimResultProps = {
	result: ThresholdSimulateResponse | null;
	onApply: (note: string) => Promise<void> | void;
	applying?: boolean;
};

export function ThresholdsSimResult({ result, onApply, applying }: ThresholdsSimResultProps) {
	const [note, setNote] = useState('');
	const [error, setError] = useState<string | null>(null);

	if (!result) {
		return (
			<section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
				Run a simulation to view projected impact and unlock apply controls.
			</section>
		);
	}

	const handleApply = async () => {
		setError(null);
		try {
			await onApply(note.trim());
			setNote('');
		} catch (applyError) {
			setError(applyError instanceof Error ? applyError.message : 'Unable to apply thresholds');
		}
	};

	return (
		<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="flex flex-col gap-1">
				<h3 className="text-lg font-semibold text-slate-900">Simulation result</h3>
				<span className="text-xs text-slate-500">Generated {new Date(result.generated_at).toLocaleString()}</span>
			</header>

			<ul className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
				<li className="rounded-xl bg-slate-50 p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clean delta</p>
					<p className="mt-1 text-2xl font-semibold text-emerald-600">{result.impact.clean_delta}</p>
				</li>
				<li className="rounded-xl bg-slate-50 p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review delta</p>
					<p className="mt-1 text-2xl font-semibold text-amber-600">{result.impact.review_delta}</p>
				</li>
				<li className="rounded-xl bg-slate-50 p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quarantine delta</p>
					<p className="mt-1 text-2xl font-semibold text-rose-600">{result.impact.quarantine_delta}</p>
				</li>
				<li className="rounded-xl bg-slate-50 p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Block delta</p>
					<p className="mt-1 text-2xl font-semibold text-slate-900">{result.impact.block_delta}</p>
				</li>
			</ul>

			{typeof result.impact.false_positive_estimate === 'number' && (
				<p className="text-sm text-slate-600">Estimated false positives: {result.impact.false_positive_estimate}</p>
			)}

			<label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="threshold-note">
				Change note (required)
			</label>
			<textarea
				id="threshold-note"
				value={note}
				onChange={(event) => setNote(event.target.value)}
				className="h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
				placeholder="Summarize why you are applying this update"
			/>

			{error && <p className="text-sm text-rose-600">{error}</p>}

			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={handleApply}
					className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
					disabled={!note.trim() || applying}
				>
					{applying ? 'Applying…' : 'Apply thresholds'}
				</button>
				<span className="text-xs text-slate-500">Simulation token expires 15 minutes after generation.</span>
			</div>
		</section>
	);
}
