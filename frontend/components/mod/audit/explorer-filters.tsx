"use client";

import { useMemo } from "react";

import type { AuditQuery } from "@/hooks/mod/audit/use-audit-list";

export type ExplorerFiltersProps = {
	value: AuditQuery;
	onChange: (next: AuditQuery) => void;
	onSubmit?: () => void;
	onReset?: () => void;
	isLoading?: boolean;
};

function updateQuery(prev: AuditQuery, patch: Partial<AuditQuery>): AuditQuery {
	return { ...prev, ...patch };
}

export function ExplorerFilters({ value, onChange, onSubmit, onReset, isLoading }: ExplorerFiltersProps) {
	const actionsInput = useMemo(() => (value.action?.length ? value.action.join(", ") : ""), [value.action]);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit?.();
			}}
			className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
		>
			<header className="flex items-center justify-between">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Filters</h2>
				<button
					type="button"
					onClick={() => {
						onChange({});
						onReset?.();
					}}
					className="text-xs font-semibold text-slate-500 hover:text-slate-700"
				>
					Clear
				</button>
			</header>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Target type
					<input
						type="text"
						value={value.target_type ?? ""}
						onChange={(event) => onChange(updateQuery(value, { target_type: event.target.value || undefined }))}
						className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
						placeholder="case, user, report"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Target id
					<input
						type="text"
						value={value.target_id ?? ""}
						onChange={(event) => onChange(updateQuery(value, { target_id: event.target.value || undefined }))}
						className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
						placeholder="uuid"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Actor id/email
					<input
						type="text"
						value={value.actor_id ?? ""}
						onChange={(event) => onChange(updateQuery(value, { actor_id: event.target.value || undefined }))}
						className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
						placeholder="moderator id"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2 lg:col-span-1">
					Actions (comma separated)
					<input
						type="text"
						value={actionsInput}
						onChange={(event) => {
							const next = event.target.value;
							const actions = next
								.split(",")
								.map((part) => part.trim())
								.filter(Boolean);
							onChange(updateQuery(value, { action: actions.length ? actions : undefined }));
						}}
						className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
						placeholder="action.apply, case.update"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					From (ISO)
					<input
						type="datetime-local"
						value={value.from ?? ""}
						onChange={(event) => onChange(updateQuery(value, { from: event.target.value || undefined }))}
						className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					To (ISO)
					<input
						type="datetime-local"
						value={value.to ?? ""}
						onChange={(event) => onChange(updateQuery(value, { to: event.target.value || undefined }))}
						className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
					/>
				</label>
				<label className="md:col-span-3 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Free text
					<input
						type="search"
						value={value.q ?? ""}
						onChange={(event) => onChange(updateQuery(value, { q: event.target.value || undefined }))}
						className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
						placeholder="policy eval"
					/>
				</label>
			</div>
			<footer className="flex items-center justify-end gap-2">
				<button
					type="submit"
					disabled={isLoading}
					className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
				>
					Apply
				</button>
			</footer>
		</form>
	);
}
