"use client";

import { useEffect, useMemo, useState } from 'react';

import type { MediaThresholds } from '@/hooks/mod/safety/use-thresholds';
import type { ThresholdChange, ThresholdSimulateRequest, ThresholdSimulateResponse } from '@/hooks/mod/safety/use-thresholds-simulate';

export type ThresholdsEditorProps = {
	profiles: MediaThresholds[];
	onSimulate: (payload: ThresholdSimulateRequest) => Promise<ThresholdSimulateResponse>;
	simulatePending?: boolean;
	onSimulateComplete: (result: ThresholdSimulateResponse) => void;
};

type DraftBand = {
	metric: string;
	soft_review: number;
	hard_block: number;
	soft_clean?: number;
};

type DraftState = Record<string, DraftBand[]>; // key: kind

function toDraft(profiles: MediaThresholds[]): DraftState {
	return profiles.reduce<DraftState>((acc, profile) => {
		acc[profile.kind] = profile.bands.map((band): DraftBand => ({
			metric: band.metric,
			soft_review: band.soft_review,
			hard_block: band.hard_block,
			soft_clean: band.soft_clean,
		}));
		return acc;
	}, {} as DraftState);
}

function toChangeList(original: MediaThresholds | undefined, draft: DraftBand[]): ThresholdChange[] {
	if (!original) return [];
	return draft
		.map((band) => {
			const baseline = original.bands.find((item: MediaThresholds['bands'][number]) => item.metric === band.metric);
			const patch: ThresholdChange = { metric: band.metric };
			let changed = false;
			if (baseline?.soft_review !== band.soft_review) {
				patch.soft_review = band.soft_review;
				changed = true;
			}
			if (baseline?.hard_block !== band.hard_block) {
				patch.hard_block = band.hard_block;
				changed = true;
			}
			if (baseline?.soft_clean !== band.soft_clean) {
				patch.soft_clean = band.soft_clean;
				changed = true;
			}
			return changed ? patch : null;
		})
		.filter((item): item is ThresholdChange => Boolean(item));
}

export function ThresholdsEditor({ profiles, onSimulate, simulatePending, onSimulateComplete }: ThresholdsEditorProps) {
	const [drafts, setDrafts] = useState<DraftState>(() => toDraft(profiles));
	const [activeKind, setActiveKind] = useState<'text' | 'image' | 'url'>(() => (profiles[0]?.kind ?? 'text'));
	const [lookbackHours, setLookbackHours] = useState(24);
	const [sampleSize, setSampleSize] = useState(5000);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setDrafts(toDraft(profiles));
		if (profiles.length) {
			setActiveKind(profiles[0].kind);
		}
	}, [profiles]);

	const currentProfile = useMemo(() => profiles.find((profile) => profile.kind === activeKind), [profiles, activeKind]);
	const currentDraft = drafts[activeKind] ?? [];

	const handleFieldChange = (metric: string, key: 'soft_review' | 'hard_block' | 'soft_clean', value: number) => {
		setDrafts((state) => {
			const next: DraftState = { ...state };
			const bands = [...(state[activeKind] ?? [])];
			const index = bands.findIndex((band) => band.metric === metric);
			if (index >= 0) {
				bands[index] = { ...bands[index], [key]: value };
			} else {
				bands.push({ metric, soft_review: value, hard_block: value });
			}
			next[activeKind] = bands;
			return next;
		});
	};

	const handleSimulate = async () => {
		setError(null);
		const changes = toChangeList(currentProfile, currentDraft);
		if (!changes.length) {
			setError('No threshold changes detected for this profile.');
			return;
		}
		try {
			const result = await onSimulate({
				kind: activeKind,
				changes,
				lookback_hours: lookbackHours,
				sample_size: sampleSize,
			});
			onSimulateComplete(result);
		} catch (simulateError) {
			setError(simulateError instanceof Error ? simulateError.message : 'Simulation failed');
		}
	};

	return (
		<section className="space-y-6">
			<header className="flex flex-col gap-2">
				<h2 className="text-xl font-semibold text-slate-900">Safety thresholds</h2>
				<p className="text-sm text-slate-600">Adjust thresholds per content type and preview the expected impact before applying.</p>
			</header>

			<nav className="flex items-center gap-2">
				{profiles.map((profile) => (
					<button
						key={profile.kind}
						type="button"
						onClick={() => setActiveKind(profile.kind)}
						className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeKind === profile.kind ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
					>
						{profile.kind.toUpperCase()}
					</button>
				))}
			</nav>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<table className="min-w-full divide-y divide-slate-200 text-sm text-slate-600">
					<thead className="bg-slate-50">
						<tr>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Signal</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Soft review</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Hard block</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Soft clean</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{currentDraft.map((band) => (
							<tr key={band.metric}>
								<th scope="row" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{band.metric}</th>
								<td className="px-4 py-3">
									<input
										type="number"
										step="0.01"
										value={band.soft_review}
										onChange={(event) => handleFieldChange(band.metric, 'soft_review', Number(event.target.value))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
										min={0}
										max={1}
										aria-label={`${band.metric} soft review`}
									/>
								</td>
								<td className="px-4 py-3">
									<input
										type="number"
										step="0.01"
										value={band.hard_block}
										onChange={(event) => handleFieldChange(band.metric, 'hard_block', Number(event.target.value))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
										min={0}
										max={1}
										aria-label={`${band.metric} hard block`}
									/>
								</td>
								<td className="px-4 py-3">
									<input
										type="number"
										step="0.01"
										value={band.soft_clean ?? 0}
										onChange={(event) => handleFieldChange(band.metric, 'soft_clean', Number(event.target.value))}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
										min={0}
										max={1}
										aria-label={`${band.metric} soft clean`}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Lookback hours
					<input
						type="number"
						value={lookbackHours}
						onChange={(event) => setLookbackHours(Number(event.target.value))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						min={1}
						max={168}
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Sample size
					<input
						type="number"
						value={sampleSize}
						onChange={(event) => setSampleSize(Number(event.target.value))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						min={100}
						step={100}
					/>
				</label>
			</div>

			{error && <p className="text-sm text-rose-600">{error}</p>}

			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={handleSimulate}
					className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
					disabled={simulatePending}
				>
					{simulatePending ? 'Simulating…' : 'Simulate impact'}
				</button>
				<span className="text-xs text-slate-500">Simulation required before apply. Changes compared to current snapshot.</span>
			</div>

			{currentProfile?.snapshot && (
				<section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
					<header className="mb-2 flex items-center justify-between">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current snapshot</h3>
						<span>{new Date(currentProfile.updated_at).toLocaleString()}</span>
					</header>
					<pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words">{JSON.stringify(currentProfile.snapshot, null, 2)}</pre>
				</section>
			)}
		</section>
	);
}
