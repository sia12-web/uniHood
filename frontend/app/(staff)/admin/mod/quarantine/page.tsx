"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { QuarantineBatchBar } from "@/components/mod/quarantine/batch-bar";
import { QuarantineFiltersForm } from "@/components/mod/quarantine/filters";
import { QuarantineGridVirtual } from "@/components/mod/quarantine/grid-virtual";
import type { QuarantineFilters } from "@/hooks/mod/use-quarantine";
import { useQuarantine } from "@/hooks/mod/use-quarantine";
import { useQuarantineDecision } from "@/hooks/mod/use-quarantine-decision";

export default function ModQuarantinePage() {
	const [filters, setFilters] = useState<QuarantineFilters>({ status: "needs_review" });
	const [selected, setSelected] = useState<Record<string, boolean>>({});
	const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, error } = useQuarantine(filters);
	const { mutateAsync: submitDecision, isPending: decisionPending } = useQuarantineDecision();

	const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
	const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

	useEffect(() => {
		const available = new Set(items.map((item) => item.id));
		setSelected((current) => {
			const activeIds = Object.keys(current).filter((id) => available.has(id));
			if (activeIds.length === Object.keys(current).length) {
				return current;
			}
			const next: Record<string, boolean> = {};
			for (const id of activeIds) {
				next[id] = true;
			}
			return next;
		});
	}, [items]);

	const handleToggle = useCallback((id: string) => {
		setSelected((current) => {
			const next = { ...current };
			if (next[id]) {
				delete next[id];
			} else {
				next[id] = true;
			}
			return next;
		});
	}, []);

	const handleDecision = useCallback(
		async (id: string, verdict: 'clean' | 'tombstone' | 'blocked') => {
			try {
				await submitDecision({ id, verdict });
				setSelected((current) => {
					if (!current[id]) {
						return current;
					}
					const next = { ...current };
					delete next[id];
					return next;
				});
			} catch (mutationError) {
				console.error("Failed to decide quarantine item", mutationError);
			}
		},
		[submitDecision]
	);

	const handleBatchDecision = useCallback(
		async (verdict: 'clean' | 'tombstone' | 'blocked') => {
			const ids = Object.keys(selected).filter((id) => selected[id]);
			if (!ids.length) {
				return;
			}
			try {
				for (const id of ids) {
					await submitDecision({ id, verdict });
				}
				setSelected({});
			} catch (mutationError) {
				console.error("Failed to apply batch decision", mutationError);
			}
		},
		[selected, submitDecision]
	);

	const handleClearSelection = useCallback(() => setSelected({}), []);

	const hasItems = items.length > 0;
	const queryError = error ? (error instanceof Error ? error.message : "Unable to load quarantine queue") : null;

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<h2 className="text-2xl font-semibold text-slate-900">Quarantine</h2>
				<p className="text-sm text-slate-600">Review quarantined media and apply bulk decisions when ready.</p>
			</header>

			<QuarantineFiltersForm filters={filters} onChange={setFilters} />

			{queryError && (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{queryError}
				</div>
			)}

			{selectedCount > 0 && (
				<QuarantineBatchBar
					selectedCount={selectedCount}
					onClear={handleClearSelection}
					onDecision={handleBatchDecision}
					disabled={decisionPending}
				/>
			)}

			<QuarantineGridVirtual
				items={items}
				selectedIds={selected}
				onToggle={handleToggle}
				onDecision={handleDecision}
				loading={isLoading}
				decisionDisabled={decisionPending}
			/>

			{hasItems && hasNextPage && (
				<button
					type="button"
					onClick={() => fetchNextPage()}
					className="self-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-900"
					disabled={isFetchingNextPage}
				>
					{isFetchingNextPage ? "Loading more…" : "Load more"}
				</button>
			)}
		</div>
	);
}
