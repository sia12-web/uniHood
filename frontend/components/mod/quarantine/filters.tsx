"use client";

import { useEffect, useState } from "react";

import type { QuarantineFilters } from "@/hooks/mod/use-quarantine";

const STATUS_OPTIONS = [
	{ value: "", label: "All" },
	{ value: "needs_review", label: "Needs review" },
	{ value: "quarantined", label: "Quarantined" },
];

const TYPE_OPTIONS = [
	{ value: "", label: "All" },
	{ value: "image", label: "Images" },
	{ value: "file", label: "Files" },
];

export type QuarantineFiltersProps = {
	filters: QuarantineFilters;
	onChange: (filters: QuarantineFilters) => void;
};

export function QuarantineFiltersForm({ filters, onChange }: QuarantineFiltersProps) {
	const [local, setLocal] = useState(filters);

	useEffect(() => {
		setLocal(filters);
	}, [filters]);

	function update<K extends keyof QuarantineFilters>(key: K, value: QuarantineFilters[K]) {
		const next = { ...local, [key]: value || undefined };
		setLocal(next);
		onChange(next);
	}

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex flex-wrap items-center gap-4">
				<label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Status</span>
					<select
						className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
						value={local.status ?? ""}
						onChange={(event) => update('status', event.target.value as QuarantineFilters['status'] ?? undefined)}
					>
						{STATUS_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Type</span>
					<select
						className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
						value={local.type ?? ""}
						onChange={(event) => update('type', event.target.value as QuarantineFilters['type'] ?? undefined)}
					>
						{TYPE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Campus</span>
					<input
						type="text"
						value={local.campusId ?? ""}
						onChange={(event) => update('campusId', event.target.value || undefined)}
						className="mt-1 w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
					/>
				</label>
				<label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Captured after</span>
					<input
						type="datetime-local"
						value={local.capturedAfter ?? ""}
						onChange={(event) => update('capturedAfter', event.target.value || undefined)}
						className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
					/>
				</label>
			</div>
		</section>
	);
}
