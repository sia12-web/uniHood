"use client";

import type { QuarantineItem } from "@/hooks/mod/use-quarantine";

import { QuarantineCard } from "./card";

export type QuarantineGridProps = {
	items: QuarantineItem[];
	selectedIds: Record<string, boolean>;
	onToggle: (id: string) => void;
	onDecision: (id: string, verdict: 'clean' | 'tombstone' | 'blocked') => void;
	loading?: boolean;
	decisionDisabled?: boolean;
};

export function QuarantineGridVirtual({ items, selectedIds, onToggle, onDecision, loading, decisionDisabled }: QuarantineGridProps) {
	if (!items.length) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
				{loading ? 'Loading quarantine queue…' : 'No items awaiting review.'}
			</div>
		);
	}

	return (
		<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{items.map((item) => (
				<QuarantineCard
					key={item.id}
					item={item}
					selected={Boolean(selectedIds[item.id])}
					onToggleSelected={onToggle}
					onDecision={onDecision}
					decisionDisabled={decisionDisabled}
				/>
			))}
		</section>
	);
}
