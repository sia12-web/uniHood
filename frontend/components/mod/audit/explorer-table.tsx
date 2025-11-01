"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { AuditEvent } from "@/hooks/mod/audit/use-audit-list";

import { AuditRow } from "./row";

export type ExplorerTableProps = {
	events: AuditEvent[];
	expandedId: string | null;
	onToggleRow: (id: string) => void;
	onLoadMore?: () => void;
	hasNextPage?: boolean;
	isLoading?: boolean;
	isFetchingNext?: boolean;
	isAdmin: boolean;
};

const ESTIMATE_ROW_HEIGHT = 140;

export function ExplorerTable({
	events,
	expandedId,
	onToggleRow,
	onLoadMore,
	hasNextPage,
	isLoading,
	isFetchingNext,
	isAdmin,
}: ExplorerTableProps) {
	const parentRef = useRef<HTMLDivElement | null>(null);
	const innerRef = useRef<HTMLDivElement | null>(null);
	const totalCount = hasNextPage ? events.length + 1 : events.length;

	const rowVirtualizer = useVirtualizer({
		count: totalCount,
		overscan: 6,
		estimateSize: () => ESTIMATE_ROW_HEIGHT,
		getScrollElement: () => parentRef.current,
	});

	const virtualRows = rowVirtualizer.getVirtualItems();

	const isEmpty = !events.length && !isLoading;

	useEffect(() => {
		if (!hasNextPage || !onLoadMore) {
			return;
		}
		const last = virtualRows[virtualRows.length - 1];
		if (!last) {
			return;
		}
		if (last.index >= events.length - 1) {
			onLoadMore();
		}
	}, [virtualRows, hasNextPage, onLoadMore, events.length]);

	useEffect(() => {
		if (!innerRef.current) {
			return;
		}
		innerRef.current.style.height = `${rowVirtualizer.getTotalSize()}px`;
		innerRef.current.style.position = "relative";
	}, [rowVirtualizer, virtualRows]);

	useEffect(() => {
		virtualRows.forEach((virtualRow) => {
			const element = innerRef.current?.querySelector<HTMLDivElement>(`[data-index="${virtualRow.index}"]`);
			if (!element) {
				return;
			}
			element.style.position = "absolute";
			element.style.top = `${virtualRow.start}px`;
			element.style.left = "0";
			element.style.right = "0";
		});
	}, [virtualRows]);

	const content = useMemo(() => {
		if (isEmpty) {
			return <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No audit events matched the current filters.</p>;
		}
		return null;
	}, [isEmpty]);

	return (
		<div className="h-[70vh] rounded-3xl border border-slate-200 bg-slate-50">
			<div ref={parentRef} className="h-full overflow-y-auto px-4 py-4" role="list">
				<div ref={innerRef}>
					{virtualRows.map((virtualRow) => {
						const index = virtualRow.index;
						if (index >= events.length) {
							return (
								<div
									key={`loader-${index}`}
									data-index={index}
									role="listitem"
									className="flex items-center justify-center px-4 py-3 text-sm text-slate-500"
								>
									{isFetchingNext ? "Loading more…" : "No more events"}
								</div>
							);
						}
						const row = events[index];
						return (
							<div key={row.id} data-index={index} role="listitem">
								<AuditRow event={row} expanded={expandedId === row.id} onToggle={onToggleRow} isAdmin={isAdmin} />
							</div>
						);
					})}
				</div>
			</div>
			{content}
		</div>
	);
}
