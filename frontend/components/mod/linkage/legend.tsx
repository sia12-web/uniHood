"use client";

const LEGEND_ITEMS = [
	{ band: "good", label: "Good" },
	{ band: "neutral", label: "Neutral" },
	{ band: "watch", label: "Watch" },
	{ band: "risk", label: "Risk" },
	{ band: "bad", label: "Bad" },
];

const BAND_BG: Record<string, string> = {
	good: "bg-emerald-100 border border-emerald-200",
	neutral: "bg-slate-200 border border-slate-300",
	watch: "bg-amber-100 border border-amber-200",
	risk: "bg-orange-100 border border-orange-200",
	bad: "bg-rose-100 border border-rose-200",
};

export function LinkageLegend() {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
			{LEGEND_ITEMS.map((item) => (
				<span key={item.band} className={`flex items-center gap-2 rounded-full px-3 py-1 ${BAND_BG[item.band]}`}>
					<span className="h-2 w-2 rounded-full bg-slate-900" />
					{item.label}
				</span>
			))}
			<span className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1">
				<span className="h-2 w-2 rounded-full bg-slate-900" /> Moderator
			</span>
			<span className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1">
				<span className="h-2 w-2 rounded-full bg-slate-900" /> Admin
			</span>
		</div>
	);
}
