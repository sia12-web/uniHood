"use client";

export type QuarantineBatchBarProps = {
	selectedCount: number;
	onClear: () => void;
	onDecision: (verdict: 'clean' | 'tombstone' | 'blocked') => void;
	disabled?: boolean;
};

export function QuarantineBatchBar({ selectedCount, onClear, onDecision, disabled }: QuarantineBatchBarProps) {
	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
			<div className="flex items-center gap-3 text-sm text-slate-600">
				<span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">{selectedCount}</span>
				<span>{selectedCount === 1 ? 'item selected' : 'items selected'}</span>
				<button
					type="button"
					onClick={onClear}
					className="text-xs font-semibold uppercase tracking-wide text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
					disabled={selectedCount === 0}
				>
					Clear
				</button>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() => onDecision('clean')}
					className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
					disabled={disabled || selectedCount === 0}
				>
					Mark clean
				</button>
				<button
					type="button"
					onClick={() => onDecision('tombstone')}
					className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
					disabled={disabled || selectedCount === 0}
				>
					Tombstone
				</button>
				<button
					type="button"
					onClick={() => onDecision('blocked')}
					className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
					disabled={disabled || selectedCount === 0}
				>
					Block
				</button>
			</div>
		</section>
	);
}
