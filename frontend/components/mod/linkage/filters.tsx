"use client";

import type { LinkageFilters } from "@/hooks/mod/linkage/use-linkage";

export type LinkageFiltersProps = {
	filters: LinkageFilters;
	campuses?: string[];
	onChange: (next: LinkageFilters) => void;
	listView: boolean;
	onToggleListView: (list: boolean) => void;
};

export function LinkageFiltersBar({ filters, campuses, onChange, listView, onToggleListView }: LinkageFiltersProps) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
			<label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Relation
				<select
					className="mt-1 w-40 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
					value={filters.relation ?? "all"}
					onChange={(event) => onChange({ ...filters, relation: event.target.value === "all" ? undefined : (event.target.value as LinkageFilters["relation"]) })}
				>
					<option value="all">All relations</option>
					<option value="shared_device">Shared device</option>
					<option value="shared_ip_24h">Shared IP (24h)</option>
					<option value="shared_cookie">Shared cookie</option>
				</select>
			</label>
			<label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Min strength
				<input
					type="number"
					min={0}
					max={100}
					step={5}
					value={filters.minStrength ?? 0}
					onChange={(event) => onChange({ ...filters, minStrength: Number(event.target.value) })}
					className="mt-1 w-28 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
				/>
			</label>
			<label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Campus
				<select
					className="mt-1 w-36 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
					value={filters.campus ?? "all"}
					onChange={(event) => onChange({ ...filters, campus: event.target.value === "all" ? undefined : event.target.value })}
				>
					<option value="all">All campuses</option>
					{campuses?.map((campus) => (
						<option key={campus} value={campus}>
							{campus}
						</option>
					))}
				</select>
			</label>
			<div className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-600">
				<span id="linkage-list-view-label">List view</span>
				<button
					type="button"
					className={`h-6 w-12 rounded-full border border-slate-200 transition ${listView ? "bg-slate-900" : "bg-slate-200"}`}
					onClick={() => onToggleListView(!listView)}
					aria-pressed={listView ? "true" : "false"}
					aria-labelledby="linkage-list-view-label"
					aria-label={listView ? "Disable list view" : "Enable list view"}
				>
					<span className={`block h-5 w-5 rounded-full bg-white shadow transition ${listView ? "translate-x-6" : "translate-x-1"}`} />
				</button>
			</div>
		</div>
	);
}
