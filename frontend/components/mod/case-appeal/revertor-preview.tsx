"use client";

export type RevertorPreviewProps = {
	revertors?: string[];
	variant?: "default" | "highlight";
	className?: string;
};

export function RevertorPreview({ revertors, variant = "default", className }: RevertorPreviewProps) {
	if (!revertors?.length) return null;

	const style =
		variant === "highlight"
			? "border-emerald-200 bg-emerald-50 text-emerald-700"
			: "border-slate-200 bg-slate-50 text-slate-600";

	return (
		<div className={`rounded-2xl border px-4 py-3 text-sm ${style} ${className ?? ""}`.trim()}>
			<p className="text-xs font-semibold uppercase tracking-wide">Revert actions</p>
			<ul className="mt-2 list-disc space-y-1 pl-5">
				{revertors.map((action) => (
					<li key={action}>{action}</li>
				))}
			</ul>
		</div>
	);
}
