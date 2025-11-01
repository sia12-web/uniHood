"use client";

import { useEffect, useMemo, useState } from "react";

import type { SlaState } from "@/hooks/mod/triage/use-sla";

export type SlaBadgeProps = {
	compute: () => SlaState;
};

export function SlaBadge({ compute }: SlaBadgeProps) {
	const [state, setState] = useState<SlaState>(() => compute());

	useEffect(() => {
		setState(compute());
	}, [compute]);

	useEffect(() => {
		const id = setInterval(() => {
			setState(compute());
		}, 1_000);
		return () => clearInterval(id);
	}, [compute]);

	const className = useMemo(() => {
		switch (state.badge) {
			case "ok":
				return "bg-emerald-100 text-emerald-700 border-emerald-200";
			case "warning":
				return "bg-amber-100 text-amber-700 border-amber-200";
			case "breach":
			default:
				return "bg-rose-100 text-rose-700 border-rose-200";
		}
	}, [state.badge]);

	return (
		<span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
			<span>SLA</span>
			<span aria-live="polite">{state.remainingText}</span>
		</span>
	);
}
