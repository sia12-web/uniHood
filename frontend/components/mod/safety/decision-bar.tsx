"use client";

import { useState } from 'react';

export type DecisionBarProps = {
	onDecision: (payload: { verdict: 'clean' | 'tombstone' | 'blocked'; note?: string }) => Promise<void> | void;
	busy?: boolean;
	onPrev?: () => void;
	onNext?: () => void;
	hasPrev?: boolean;
	hasNext?: boolean;
};

type Verdict = 'clean' | 'tombstone' | 'blocked';

export function DecisionBar({ onDecision, busy, onPrev, onNext, hasPrev, hasNext }: DecisionBarProps) {
	const [pendingVerdict, setPendingVerdict] = useState<Verdict | null>(null);
	const [note, setNote] = useState('');

	const closeModal = () => {
		setPendingVerdict(null);
	};

	const handleSubmit = async () => {
		if (!pendingVerdict) return;
		await onDecision({ verdict: pendingVerdict, note: note.trim() || undefined });
		setNote('');
		closeModal();
	};

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onPrev}
						className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
						disabled={!onPrev || busy || !hasPrev}
					>
						← Previous
					</button>
					<button
						type="button"
						onClick={onNext}
						className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
						disabled={!onNext || busy || !hasNext}
					>
						Next →
					</button>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => setPendingVerdict('clean')}
						className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-50"
						disabled={busy}
					>
						Mark clean
					</button>
					<button
						type="button"
						onClick={() => setPendingVerdict('tombstone')}
						className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:opacity-50"
						disabled={busy}
					>
						Tombstone
					</button>
					<button
						type="button"
						onClick={() => setPendingVerdict('blocked')}
						className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-50"
						disabled={busy}
					>
						Block
					</button>
				</div>
			</div>

			{pendingVerdict && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
					<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
						<h2 className="text-lg font-semibold text-slate-900">Confirm decision</h2>
						<p className="mt-2 text-sm text-slate-600">
							Provide an optional note for the audit trail before applying this decision.
						</p>
						<label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="decision-note">
							Note (optional)
						</label>
						<textarea
							id="decision-note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
							className="mt-1 h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
							placeholder="Add context for this action"
						/>
						<div className="mt-6 flex justify-end gap-2">
							<button
								type="button"
								onClick={closeModal}
								className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
								disabled={busy}
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSubmit}
								className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
								disabled={busy}
							>
								Confirm
							</button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
