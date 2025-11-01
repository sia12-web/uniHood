export type StatsStripProps = {
	count?: number | null;
	estimated?: number | null;
	ratePerMinute?: number | null;
	windowLabel?: string;
};

export function StatsStrip({ count, estimated, ratePerMinute, windowLabel }: StatsStripProps) {
	const hasStats = typeof count === "number" || typeof estimated === "number" || typeof ratePerMinute === "number";
	if (!hasStats) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
			{typeof count === "number" ? (
				<span className="font-semibold text-slate-800">
					<span className="text-xs uppercase tracking-wide text-slate-500">Fetched</span>
					<br />
					{count.toLocaleString()}
				</span>
			) : null}
			{typeof estimated === "number" ? (
				<span>
					<span className="text-xs uppercase tracking-wide text-slate-500">Estimate</span>
					<br />
					{estimated.toLocaleString()}
				</span>
			) : null}
			{typeof ratePerMinute === "number" ? (
				<span>
					<span className="text-xs uppercase tracking-wide text-slate-500">Rate / min</span>
					<br />
					{ratePerMinute.toFixed(2)}
				</span>
			) : null}
			{windowLabel ? (
				<span className="text-xs text-slate-500">{windowLabel}</span>
			) : null}
		</div>
	);
}
