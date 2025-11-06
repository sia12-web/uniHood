"use client";

type LiveMode = "live" | "passive";

type LiveModeToggleProps = {
	mode: LiveMode;
	onToggle: (mode: LiveMode) => void;
	ghostModeEnabled?: boolean;
	trustScore?: number | null;
	onExplainTrust?: () => void;
};

export function LiveModeToggle({ mode, onToggle, ghostModeEnabled, trustScore, onExplainTrust }: LiveModeToggleProps) {
	const nextMode: LiveMode = mode === "live" ? "passive" : "live";
	const trustLabel = trustScore != null ? `${trustScore}% profile trust` : "Profile trust tips";

	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-900/95 p-4 text-white shadow-lg">
			<header className="flex items-center justify-between">
				<h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Presence</h2>
				<span className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === "live" ? "bg-emerald-200 text-emerald-900" : "bg-slate-700 text-white/80"}`}>
					{mode === "live" ? "Visible" : "Browsing"}
				</span>
			</header>
			<p className="text-sm text-white/80">
				{mode === "live"
					? "You appear on nearby maps and can receive instant study invites."
					: "You are hidden from others but can explore who's around anonymously."}
			</p>
			<button
				type="button"
				onClick={() => onToggle(nextMode)}
				className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
			>
				<span>{mode === "live" ? "Switch to passive" : "Go live"}</span>
				<span aria-hidden className="text-base">⇆</span>
			</button>
			<div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
				<button
					type="button"
					onClick={onExplainTrust}
					className="rounded-full border border-white/20 bg-white/10 px-3 py-1 font-medium text-white/80 transition hover:border-white/40 hover:bg-white/20"
					title="Learn how your profile completeness boosts your visibility"
				>
					{trustLabel}
				</button>
				{ghostModeEnabled ? (
					<span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100/30 px-3 py-1 text-amber-200">
						<span aria-hidden>👻</span>
						Ghost mode on — classmates cannot see you
					</span>
				) : null}
			</div>
		</section>
	);
}
