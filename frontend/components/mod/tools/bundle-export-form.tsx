"use client";

import { useMemo, useState } from "react";

export type BundleExportFormProps = {
	availableKeys: string[];
	onExport(keys: string[]): void;
	pending: boolean;
};

export function BundleExportForm({ availableKeys, onExport, pending }: BundleExportFormProps) {
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<string[]>([]);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return availableKeys;
		return availableKeys.filter((key) => key.toLowerCase().includes(term));
	}, [availableKeys, search]);

	function toggle(key: string) {
		setSelected((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
	}

	return (
		<section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Export bundles</h2>
				<p className="text-sm text-slate-600">Choose actions to export as YAML for backup or migration.</p>
			</header>
			<div className="grid gap-3 md:grid-cols-[1fr_min-content]">
				<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					<span>Search</span>
					<input
						type="text"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						placeholder="Filter by key"
					/>
				</label>
				<button
					type="button"
					onClick={() => onExport(selected)}
					disabled={!selected.length || pending}
					className="self-end rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
				>
					{pending ? "Preparing…" : "Download YAML"}
				</button>
			</div>
			<div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
				<ul className="divide-y divide-slate-200 text-sm text-slate-700">
					{filtered.map((key) => (
						<li key={key} className="flex items-center justify-between px-4 py-2">
							<label className="flex items-center gap-2">
								<input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} />
								<span className="font-mono text-xs uppercase text-slate-500">{key}</span>
							</label>
							<button
								type="button"
								onClick={() => {
									setSelected((prev) => (prev.includes(key) ? prev : [...prev, key]));
									onExport([key]);
								}}
								className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
							>
								Quick export
							</button>
						</li>
					))}
					{!filtered.length ? <li className="px-4 py-8 text-center text-sm text-slate-500">No matching actions</li> : null}
				</ul>
			</div>
			<p className="text-xs text-slate-500">Exports include guard specs and metadata. Audit logs capture download events.</p>
		</section>
	);
}
