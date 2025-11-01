"use client";

import { useEffect, useState } from "react";

import type { CasesFilters } from "@/hooks/mod/use-cases";

const STATUS_OPTIONS = [
	{ value: "", label: "All statuses" },
	{ value: "open", label: "Open" },
	{ value: "escalated", label: "Escalated" },
	{ value: "resolved", label: "Resolved" },
];

const SUBJECT_OPTIONS = [
	{ value: "", label: "All subjects" },
	{ value: "post", label: "Posts" },
	{ value: "comment", label: "Comments" },
	{ value: "user", label: "Users" },
];

export type CasesFiltersProps = {
	filters: CasesFilters;
	onChange: (filters: CasesFilters) => void;
};

export function CasesFilters({ filters, onChange }: CasesFiltersProps) {
	const [local, setLocal] = useState<CasesFilters>(filters);

	useEffect(() => {
		setLocal(filters);
	}, [filters]);

	function update<K extends keyof CasesFilters>(key: K, value: CasesFilters[K]) {
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
						onChange={(event) => update('status', event.target.value || undefined)}
					>
						{STATUS_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Severity ≥</span>
					<input
						type="number"
						min={0}
						max={5}
						className="mt-1 w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						value={local.severityMin ?? ""}
						onChange={(event) => update('severityMin', event.target.value ? Number(event.target.value) : undefined)}
					/>
				</label>
				<label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Subject</span>
					<select
						className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
						value={local.subjectType ?? ""}
						onChange={(event) => update('subjectType', event.target.value || undefined)}
					>
						{SUBJECT_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Appeal</span>
					<select
						className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
						value={local.appeal ?? ""}
						onChange={(event) => {
							const value = event.target.value as '' | 'open' | 'closed';
							update('appeal', value ? value : undefined);
						}}
					>
						<option value="">All</option>
						<option value="open">Appeal open</option>
						<option value="closed">Appeal closed</option>
					</select>
				</label>
				<label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Assigned</span>
					<select
						className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
						value={local.assigned ?? ""}
						onChange={(event) => {
							const value = event.target.value as '' | 'me' | 'none';
							update('assigned', value ? value : undefined);
						}}
					>
						<option value="">All</option>
						<option value="me">Assigned to me</option>
						<option value="none">Unassigned</option>
					</select>
				</label>
			</div>
		</section>
	);
}
