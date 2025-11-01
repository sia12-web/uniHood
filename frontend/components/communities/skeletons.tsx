"use client";

import { memo } from "react";

function baseSkeleton(className?: string) {
	return `animate-pulse rounded-md bg-slate-200 ${className ?? ""}`.trim();
}

export const SidebarListSkeleton = memo(function SidebarListSkeleton({ rows = 4 }: { rows?: number }) {
	return (
		<ul className="flex flex-col gap-2" aria-hidden>
			{Array.from({ length: rows }).map((_, index) => (
				<li key={index} className={baseSkeleton("h-9")}></li>
			))}
		</ul>
	);
});

export const CardSkeleton = memo(function CardSkeleton() {
	return <div className={baseSkeleton("h-36 w-full")}></div>;
});

export const TableRowSkeleton = memo(function TableRowSkeleton() {
	return <div className={baseSkeleton("h-10 w-full")}></div>;
});
