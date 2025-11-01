'use client';

import { useCallback, useEffect, useMemo, useState } from "react";

import { CasesActionsBar } from "@/components/mod/cases/actions-bar";
import { CasesFilters } from "@/components/mod/cases/filters";
import { CasesTableVirtual } from "@/components/mod/cases/table-virtual";
import type { CaseBulkActionRequest, CasesFilters as CasesQuery } from "@/hooks/mod/use-cases";
import { useCases, useCasesBulkAction } from "@/hooks/mod/use-cases";

export default function ModerationCasesPage() {
	const [filters, setFilters] = useState<CasesQuery>({ status: "open" });
	const [selected, setSelected] = useState<Record<string, boolean>>({});

	const { data, error, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useCases(filters);
	const { mutateAsync: runBulkAction, isPending: bulkPending } = useCasesBulkAction();

	const cases = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
	const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

	useEffect(() => {
		// Drop selections that no longer exist in the visible list.
		const activeIds = new Set(cases.map((item) => item.id));
		setSelected((current) => {
			const next: Record<string, boolean> = {};
			for (const id of Object.keys(current)) {
				if (current[id] && activeIds.has(id)) {
					next[id] = true;
				}
			}
			if (Object.keys(next).length === Object.keys(current).length) {
				return current;
			}
			return next;
		});
	}, [cases]);

	const handleToggle = useCallback((caseId: string) => {
		setSelected((current) => {
			const next = { ...current };
			if (next[caseId]) {
				delete next[caseId];
			} else {
				next[caseId] = true;
			}
			return next;
		});
	}, []);

	const handleSelectAll = useCallback((checked: boolean) => {
		if (!checked) {
			setSelected({});
			return;
		}
		const next: Record<string, boolean> = {};
		for (const item of cases) {
			next[item.id] = true;
		}
		setSelected(next);
	}, [cases]);

	const handleBulkAction = useCallback(
		async (payload: CaseBulkActionRequest) => {
			try {
				await runBulkAction(payload);
				setSelected({});
			} catch (mutationError) {
				console.error("Failed to run bulk action", mutationError);
			}
		},
		[runBulkAction]
	);

	const handleFiltersChange = useCallback((nextFilters: CasesQuery) => {
		setFilters(nextFilters);
		setSelected({});
	}, []);

	const queryError = error ? (error instanceof Error ? error.message : "Unable to load cases") : null;

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<h2 className="text-2xl font-semibold text-slate-900">Cases</h2>
				<p className="text-sm text-slate-600">Review the active moderation cases, apply filters, and perform batch actions.</p>
			</header>

			<CasesFilters filters={filters} onChange={handleFiltersChange} />

			{queryError && (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{queryError}</div>
			)}

			{selectedIds.length > 0 && (
				<CasesActionsBar selectedIds={selectedIds} onClear={() => setSelected({})} onBulkAction={handleBulkAction} isSubmitting={bulkPending} />
			)}

			<CasesTableVirtual
				cases={cases}
				selectedIds={selected}
				onToggleSelect={handleToggle}
				onSelectAll={handleSelectAll}
				fetching={isLoading || isFetchingNextPage}
			/>

			{cases.length > 0 && hasNextPage && (
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
