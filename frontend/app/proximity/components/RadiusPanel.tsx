"use client";

type RadiusMeta = {
	count: number | null;
	loading: boolean;
	lastUpdated?: number;
};

type RadiusPanelProps = {
	radiusOptions: number[];
	activeRadius: number;
	meta: Record<number, RadiusMeta>;
	onRadiusChange: (radius: number) => void;
	suggestion?: { radius: number; message: string } | null;
	onSuggestionClick?: (radius: number) => void;
	accuracyMeters: number | null;
	confidencePercent: number | null;
	live: boolean;
	cooldownActive?: boolean;
	cooldownMessage?: string;
	showLiveBadge?: boolean;
};

const confidenceCopy = (confidence: number | null) => {
	if (confidence == null) {
		return "Location accuracy unknown";
	}
	if (confidence >= 80) {
		return "High confidence in nearby results";
	}
	if (confidence >= 50) {
		return "Medium confidence — consider a wider radius";
	}
	return "Low confidence — boost accuracy or expand radius";
};

const progressClass = (confidence: number | null) => {
	if (confidence == null) {
		return "w-2/12";
	}
	if (confidence >= 90) {
		return "w-full";
	}
	if (confidence >= 75) {
		return "w-10/12";
	}
	if (confidence >= 60) {
		return "w-8/12";
	}
	if (confidence >= 40) {
		return "w-6/12";
	}
	if (confidence >= 20) {
		return "w-4/12";
	}
	return "w-2/12";
};

export function RadiusPanel({
	radiusOptions,
	activeRadius,
	meta,
	onRadiusChange,
	suggestion,
	onSuggestionClick,
	accuracyMeters,
	confidencePercent,
	live,
	cooldownActive = false,
	cooldownMessage,
	showLiveBadge = true,
}: RadiusPanelProps) {
	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
			<header className="flex items-center justify-between">
				<div>
					<p className="text-sm font-semibold text-slate-900">Discovery radius</p>
					<p className="text-xs text-slate-500">Adjust how far your signal reaches.</p>
				</div>
				{showLiveBadge ? (
					<span className={`rounded-full px-3 py-1 text-xs font-medium ${live ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
						{live ? "Live mode" : "Passive"}
					</span>
				) : null}
			</header>
			<div className="flex flex-wrap gap-2">
				{radiusOptions.map((option) => {
					const info = meta[option];
					const count = info?.count ?? null;
					const label = count == null ? "…" : count === 1 ? "1 student" : `${count} students`;
					const isActive = option === activeRadius;
					const disabled = cooldownActive;
					const baseClasses = "flex grow items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm shadow-sm transition sm:grow-0";
					const stateClasses = isActive
						? "border-slate-900 bg-slate-900 text-white"
						: "border-slate-200 bg-white text-slate-700";
					const interactiveClasses = disabled ? "cursor-not-allowed opacity-60" : "hover:border-slate-400";
					return (
						<button
							key={option}
							type="button"
							onClick={() => onRadiusChange(option)}
							disabled={disabled}
							className={`${baseClasses} ${stateClasses} ${interactiveClasses}`}
						>
							<span className="font-medium">{option}m</span>
							<span className="text-xs uppercase tracking-wide text-slate-500">
								{info?.loading ? "Refreshing…" : label}
							</span>
						</button>
					);
				})}
			</div>
			{cooldownActive ? (
				<p className="text-xs font-medium text-amber-600">
					{cooldownMessage ?? "Cooling down briefly to avoid rate limits."}
				</p>
			) : null}
			<div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
				<div className="flex items-center justify-between text-xs text-slate-500">
					<span>Confidence</span>
					{accuracyMeters != null ? <span>~{accuracyMeters}m accuracy</span> : <span>Unknown</span>}
				</div>
				<div className="h-2 w-full overflow-hidden rounded-full bg-white">
					<div className={`h-full bg-emerald-500 transition-all ${progressClass(confidencePercent)}`} />
				</div>
				<p className="text-xs text-slate-500">{confidenceCopy(confidencePercent)}</p>
			</div>
			{suggestion ? (
				<button
					type="button"
					onClick={() => onSuggestionClick?.(suggestion.radius)}
					className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 transition hover:bg-sky-100"
				>
					<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">→</span>
					<span>{suggestion.message}</span>
				</button>
			) : null}
		</section>
	);
}
